// Live-app crawler.
//
// Visits the running application before generation and produces a
// CrawlResult that grounds the model in:
//   - what interactable elements exist with multiple signals (testid, role, etc.)
//   - the semantic structure of each route via Playwright's aria snapshot
//
// The crawler is OPT-IN via --app-url. When skipped, the harness still
// works against the framework catalogue alone.

import { chromium, type Page, type Frame } from "@playwright/test";
import type { CrawlResult, InteractableElement } from "./types.js";

export interface CrawlOptions {
  appUrl: string;
  /** Explicit routes to visit. If missing, we auto-discover via BFS. */
  routes?: string[];
  /** Maximum number of routes to discover via BFS. Defaults to 20. */
  maxRoutes?: number;
  /** Maximum depth for BFS discovery. Defaults to 2. */
  maxDepth?: number;
  /** Cap per-route timeout. */
  pageTimeoutMs?: number;
}

export async function crawlApp(opts: CrawlOptions): Promise<CrawlResult> {
  const pageTimeout = opts.pageTimeoutMs ?? 15000;
  const maxRoutes = opts.maxRoutes ?? 20;
  const maxDepth = opts.maxDepth ?? 2;

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  page.setDefaultTimeout(pageTimeout);

  // 1. Discover routes
  let routesToVisit: string[] = [];
  if (opts.routes && opts.routes.length > 0) {
    routesToVisit = opts.routes.map(r => new URL(r, opts.appUrl).toString());
  } else {
    // Try sitemap first, fall back to BFS
    const sitemapRoutes = await discoverRoutesFromSitemap(opts.appUrl);
    if (sitemapRoutes.length > 0) {
      routesToVisit = sitemapRoutes.slice(0, maxRoutes);
    } else {
      routesToVisit = await discoverRoutesViaBFS(page, opts.appUrl, maxRoutes, maxDepth);
    }
  }

  const results: CrawlResult["routes"] = [];
  const allTestIds = new Set<string>();

  // 2. Crawl each route
  for (const url of routesToVisit) {
    try {
      await page.goto(url, { waitUntil: "networkidle", timeout: pageTimeout });

      const elements: InteractableElement[] = [];
      
      // Walk all frames (including main frame)
      for (const frame of page.frames()) {
        const frameElements = await extractElementsFromFrame(frame);
        const frameUrl = frame.url();
        const isMainFrame = frame === page.mainFrame();
        
        elements.push(...frameElements.map(el => ({
          ...el,
          inIframe: isMainFrame ? undefined : frameUrl
        })));
      }

      // Aria snapshot
      let ariaSnapshot = "";
      try {
        const fullSnapshot = await page.locator("body").ariaSnapshot();
        ariaSnapshot = trimSnapshot(fullSnapshot, 80);
      } catch (err) {
        ariaSnapshot = `(snapshot unavailable: ${(err as Error).message})`;
      }

      results.push({
        url,
        accessibilitySummary: ariaSnapshot,
        elements,
      });

      for (const el of elements) {
        if (el.testId) allTestIds.add(el.testId);
      }
    } catch (err) {
      results.push({
        url,
        accessibilitySummary: `(failed to load: ${(err as Error).message})`,
        elements: [],
      });
    }
  }

  await browser.close();

  return {
    appUrl: opts.appUrl,
    scrapedAt: new Date().toISOString(),
    routes: results,
    allTestIds: Array.from(allTestIds).sort(),
  };
}

/**
 * Try to discover routes from sitemap.xml. Only returns same-origin URLs —
 * sitemaps sometimes include external CDN, partner, or alternate-locale URLs
 * that we shouldn't try to crawl.
 */
async function discoverRoutesFromSitemap(baseUrl: string): Promise<string[]> {
  try {
    const sitemapUrl = new URL("/sitemap.xml", baseUrl).toString();
    const baseOrigin = new URL(baseUrl).origin;
    const response = await fetch(sitemapUrl);
    if (!response.ok) return [];

    const xml = await response.text();
    const locs = xml.match(/<loc>(.*?)<\/loc>/g);
    if (!locs) return [];

    return locs
      .map((loc) => loc.replace(/<\/?loc>/g, "").trim())
      .filter((u) => {
        try {
          return new URL(u).origin === baseOrigin;
        } catch {
          return false;
        }
      });
  } catch {
    return [];
  }
}

/**
 * BFS route discovery from the entry point.
 */
async function discoverRoutesViaBFS(page: Page, startUrl: string, maxCount: number, maxDepth: number): Promise<string[]> {
  const visited = new Set<string>();
  const queue: Array<{ url: string; depth: number }> = [{ url: startUrl, depth: 0 }];
  const baseUrl = new URL(startUrl);

  while (queue.length > 0 && visited.size < maxCount) {
    const { url, depth } = queue.shift()!;
    if (visited.has(url)) continue;
    visited.add(url);

    if (depth >= maxDepth) continue;

    try {
      await page.goto(url, { waitUntil: "networkidle", timeout: 10000 });
      const links = await page.locator("a[href]").evaluateAll((as: HTMLAnchorElement[]) => 
        as.map(a => a.href)
      );

      for (const link of links) {
        try {
          const linkUrl = new URL(link);
          // Only same-origin links
          if (linkUrl.origin === baseUrl.origin && !visited.has(linkUrl.toString())) {
            queue.push({ url: linkUrl.toString(), depth: depth + 1 });
          }
        } catch { /* ignore invalid URLs */ }
      }
    } catch { /* ignore navigation failures during discovery */ }
  }

  return Array.from(visited);
}

/**
 * Extract interactable elements from a frame, including shadow DOM traversal.
 *
 * Multi-signal extraction: every element captures testId / role / accessible
 * name / label / placeholder / alt / title / text. The model picks the best
 * available signal per element when generating a selector.
 *
 * Three small details worth knowing:
 *   - We skip `el.onclick !== null` as an interactivity signal. React, Vue,
 *     Svelte all attach handlers via `addEventListener`, never `.onclick`.
 *   - We resolve <label for="x"> AND wrapped <label> patterns so form inputs
 *     get their proper label even if the team hasn't added testids yet.
 *   - We resolve aria-labelledby refs so design-system components with
 *     external label nodes still get an accessibleName.
 */
async function extractElementsFromFrame(frame: Frame): Promise<InteractableElement[]> {
  try {
    const raw = await frame.evaluate(() => {
      const interactables: Array<{
        testId?: string;
        role?: string;
        accessibleName?: string;
        label?: string;
        placeholder?: string;
        altText?: string;
        title?: string;
        text?: string;
        tag: string;
        inShadowRoot?: boolean;
      }> = [];

      const INTERACTIVE_ROLES = new Set([
        "button", "link", "checkbox", "menuitem", "option", "radio",
        "switch", "textbox", "combobox", "searchbox", "tab", "slider",
        "spinbutton",
      ]);
      const INTERACTIVE_TAGS = new Set([
        "button", "a", "input", "select", "textarea", "details", "summary",
      ]);

      function isInteractable(el: Element): boolean {
        const tag = el.tagName.toLowerCase();
        if (INTERACTIVE_TAGS.has(tag)) return true;
        const role = el.getAttribute("role");
        if (role && INTERACTIVE_ROLES.has(role)) return true;
        // testid alone qualifies — the team likely added it because they
        // intend tests to interact with this element.
        if (el.hasAttribute("data-testid")) return true;
        return false;
      }

      function getLabel(el: Element): string | undefined {
        // <label for="email">: find label that points at this element's id
        const id = el.getAttribute("id");
        if (id) {
          const lbl = el.ownerDocument?.querySelector(
            `label[for="${CSS.escape(id)}"]`
          );
          if (lbl) {
            const t = (lbl.textContent ?? "").trim().slice(0, 60);
            if (t) return t;
          }
        }
        // Wrapped: <label><input/>...</label>
        const parentLabel = el.closest("label");
        if (parentLabel && parentLabel !== el) {
          const t = (parentLabel.textContent ?? "").trim().slice(0, 60);
          if (t) return t;
        }
        return undefined;
      }

      function getAccessibleName(el: Element): string | undefined {
        const ariaLabel = el.getAttribute("aria-label");
        if (ariaLabel) return ariaLabel.slice(0, 60);
        // aria-labelledby — most design-system components use this to
        // associate a heading or hidden label with an interactive element.
        const labelledBy = el.getAttribute("aria-labelledby");
        if (labelledBy) {
          // Multiple ids are space-separated; concatenate text in order.
          const ids = labelledBy.split(/\s+/);
          const parts: string[] = [];
          for (const id of ids) {
            const ref = el.ownerDocument?.getElementById(id);
            if (ref) {
              const t = (ref.textContent ?? "").trim();
              if (t) parts.push(t);
            }
          }
          if (parts.length > 0) return parts.join(" ").slice(0, 60);
        }
        return undefined;
      }

      function walk(root: Node | ShadowRoot, inShadow: boolean = false) {
        const walker = (root.ownerDocument ?? document).createTreeWalker(
          root as Node,
          NodeFilter.SHOW_ELEMENT
        );
        let node = walker.nextNode() as Element | null;

        while (node) {
          if (isInteractable(node)) {
            const inputEl = node as HTMLInputElement;
            const imgEl = node as HTMLImageElement;
            const tag = node.tagName.toLowerCase();

            interactables.push({
              testId: node.getAttribute("data-testid") || undefined,
              role: node.getAttribute("role") || undefined,
              accessibleName: getAccessibleName(node),
              label: getLabel(node),
              placeholder:
                "placeholder" in inputEl && inputEl.placeholder
                  ? inputEl.placeholder.slice(0, 60)
                  : undefined,
              altText:
                "alt" in imgEl && imgEl.alt ? imgEl.alt.slice(0, 60) : undefined,
              title: node.getAttribute("title")?.slice(0, 60) || undefined,
              text:
                (node.textContent ?? "").trim().replace(/\s+/g, " ").slice(0, 60) ||
                undefined,
              tag,
              inShadowRoot: inShadow || undefined,
            });
          }

          if ((node as Element & { shadowRoot?: ShadowRoot }).shadowRoot) {
            walk((node as Element & { shadowRoot: ShadowRoot }).shadowRoot, true);
          }
          node = walker.nextNode() as Element | null;
        }
      }

      if (document.body) walk(document.body);
      return interactables;
    });

    // Dedup: when a page has the same logical element repeated (e.g. a
    // product-card button rendered N times in a list), the model only
    // needs to see it once. Fingerprint by signal-set, not position.
    const seen = new Set<string>();
    const deduped: InteractableElement[] = [];
    for (const el of raw) {
      const fp = [
        el.testId,
        el.tag,
        el.role,
        el.accessibleName,
        el.label,
        el.placeholder,
        el.altText,
      ].join("|");
      if (seen.has(fp)) continue;
      seen.add(fp);
      deduped.push(el);
    }
    return deduped;
  } catch {
    return [];
  }
}

function trimSnapshot(snapshot: string, maxLines: number): string {
  const lines = snapshot.split("\n");
  if (lines.length <= maxLines) return snapshot;
  return lines.slice(0, maxLines).join("\n") + `\n... (${lines.length - maxLines} more lines)`;
}
