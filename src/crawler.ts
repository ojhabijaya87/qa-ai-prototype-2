// Live-app crawler with caching.
//
// Visits the running application before generation and produces a
// CrawlResult that grounds the model in:
//   - what interactable elements exist with multiple signals (testid, role, etc.)
//   - the semantic structure of each route via Playwright's aria snapshot
//
// The crawler is OPT-IN via --app-url. When skipped, the harness still
// works against the framework catalogue alone.
//
// Caching: if a cachePath is provided, results are stored and reused
// within the cacheTtlMs (default 30 minutes). This speeds up subsequent
// runs and reduces load on the live app.

import { chromium, type Page, type Frame } from "@playwright/test";
import type { CrawlResult, InteractableElement } from "./types.js";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";

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
  /** Path to cache file (e.g., './.crawl-cache.json'). If provided, results are cached. */
  cachePath?: string;
  /** Cache validity in milliseconds. Default 30 minutes. */
  cacheTtlMs?: number;
}

export async function crawlApp(opts: CrawlOptions): Promise<CrawlResult> {
  const {
  appUrl,
  routes: explicitRoutes,
  maxRoutes = 20,
  maxDepth = 2,
  pageTimeoutMs = 15000,   // ← correct name
  cachePath,
  cacheTtlMs = 30 * 60 * 1000,
} = opts;

  // 1. Try to load from cache
  if (cachePath) {
    try {
      const cached = JSON.parse(readFileSync(cachePath, "utf8"));
      const now = Date.now();
      if (cached.scrapedAt && (now - new Date(cached.scrapedAt).getTime()) < cacheTtlMs) {
        console.log(`✓ Using cached crawl data from ${cached.scrapedAt}`);
        return cached as CrawlResult;
      } else {
        console.log(`Cache expired (older than ${cacheTtlMs / 1000 / 60} minutes), refreshing...`);
      }
    } catch (err) {
      // Cache file missing or invalid – proceed to crawl
      console.log("No valid cache found, crawling live application...");
    }
  }

  // 2. Perform actual crawl
  console.log("🕸️ Crawling live application...");
  const result = await performActualCrawl({
  appUrl,
  routes: explicitRoutes,
  maxRoutes,
  maxDepth,
  pageTimeoutMs,   // ← use the same variable name
});

  // 3. Save to cache
  if (cachePath) {
    const dir = path.dirname(cachePath);
    mkdirSync(dir, { recursive: true });
    writeFileSync(cachePath, JSON.stringify(result, null, 2));
    console.log(`💾 Crawl data saved to ${cachePath}`);
  }

  return result;
}

/**
 * The real crawling logic – extracted from the original crawlApp implementation.
 */
async function performActualCrawl(opts: {
  appUrl: string;
  routes?: string[];
  maxRoutes: number;
  maxDepth: number;
  pageTimeoutMs: number;
}): Promise<CrawlResult> {
  const { appUrl, routes: explicitRoutes, maxRoutes, maxDepth, pageTimeoutMs } = opts;

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  page.setDefaultTimeout(pageTimeoutMs);

  // 1. Discover routes
  let routesToVisit: string[] = [];
  if (explicitRoutes && explicitRoutes.length > 0) {
    routesToVisit = explicitRoutes.map((r) => new URL(r, appUrl).toString());
  } else {
    // Try sitemap first, fall back to BFS
    const sitemapRoutes = await discoverRoutesFromSitemap(appUrl);
    if (sitemapRoutes.length > 0) {
      routesToVisit = sitemapRoutes.slice(0, maxRoutes);
    } else {
      routesToVisit = await discoverRoutesViaBFS(page, appUrl, maxRoutes, maxDepth);
    }
  }

  const results: CrawlResult["routes"] = [];
  const allTestIds = new Set<string>();

  // 2. Crawl each route
  for (const url of routesToVisit) {
    try {
      await page.goto(url, { waitUntil: "networkidle", timeout: pageTimeoutMs });

      const elements: InteractableElement[] = [];

      // Walk all frames (including main frame)
      for (const frame of page.frames()) {
        const frameElements = await extractElementsFromFrame(frame);
        const frameUrl = frame.url();
        const isMainFrame = frame === page.mainFrame();

        elements.push(
          ...frameElements.map((el) => ({
            ...el,
            inIframe: isMainFrame ? undefined : frameUrl,
          }))
        );
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
    appUrl,
    scrapedAt: new Date().toISOString(),
    routes: results,
    allTestIds: Array.from(allTestIds).sort(),
  };
}

/**
 * Try to discover routes from sitemap.xml. Only returns same-origin URLs.
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
async function discoverRoutesViaBFS(
  page: Page,
  startUrl: string,
  maxCount: number,
  maxDepth: number
): Promise<string[]> {
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
        as.map((a) => a.href)
      );

      for (const link of links) {
        try {
          const linkUrl = new URL(link);
          if (linkUrl.origin === baseUrl.origin && !visited.has(linkUrl.toString())) {
            queue.push({ url: linkUrl.toString(), depth: depth + 1 });
          }
        } catch {
          /* ignore invalid URLs */
        }
      }
    } catch {
      /* ignore navigation failures during discovery */
    }
  }

  return Array.from(visited);
}

/**
 * Extract interactable elements from a frame, including shadow DOM traversal.
 */
async function extractElementsFromFrame(frame: Frame): Promise<InteractableElement[]> {
  try {
    const raw = (await frame.evaluate(PAGE_EXTRACTOR_SOURCE)) as Array<{
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
    }>;

    // Dedup by fingerprint
    const seen = new Set<string>();
    const deduped: InteractableElement[] = [];
    for (const el of raw) {
      const fp = [el.testId, el.tag, el.role, el.accessibleName, el.label, el.placeholder, el.altText].join("|");
      if (seen.has(fp)) continue;
      seen.add(fp);
      deduped.push(el);
    }
    return deduped;
  } catch (err) {
    if (process.env.QA_AI_CRAWLER_DEBUG) {
      console.error(`[crawler] extractElementsFromFrame failed: ${(err as Error).message}`);
    }
    return [];
  }
}

/**
 * Page-side element extractor as a plain JS string.
 */
const PAGE_EXTRACTOR_SOURCE = `(() => {
  const interactables = [];
  const INTERACTIVE_ROLES = new Set([
    "button", "link", "checkbox", "menuitem", "option", "radio",
    "switch", "textbox", "combobox", "searchbox", "tab", "slider",
    "spinbutton"
  ]);
  const INTERACTIVE_TAGS = new Set([
    "button", "a", "input", "select", "textarea", "details", "summary"
  ]);

  function isInteractable(el) {
    const tag = el.tagName.toLowerCase();
    if (INTERACTIVE_TAGS.has(tag)) return true;
    const role = el.getAttribute("role");
    if (role && INTERACTIVE_ROLES.has(role)) return true;
    if (el.hasAttribute("data-testid")) return true;
    return false;
  }

  function getLabel(el) {
    const id = el.getAttribute("id");
    if (id) {
      const lbl = el.ownerDocument && el.ownerDocument.querySelector(
        'label[for="' + CSS.escape(id) + '"]'
      );
      if (lbl) {
        const t = (lbl.textContent || "").trim().slice(0, 60);
        if (t) return t;
      }
    }
    const parentLabel = el.closest("label");
    if (parentLabel && parentLabel !== el) {
      const t = (parentLabel.textContent || "").trim().slice(0, 60);
      if (t) return t;
    }
    return undefined;
  }

  function getAccessibleName(el) {
    const ariaLabel = el.getAttribute("aria-label");
    if (ariaLabel) return ariaLabel.slice(0, 60);
    const labelledBy = el.getAttribute("aria-labelledby");
    if (labelledBy) {
      const ids = labelledBy.split(/\\s+/);
      const parts = [];
      for (let k = 0; k < ids.length; k++) {
        const ref = el.ownerDocument && el.ownerDocument.getElementById(ids[k]);
        if (ref) {
          const t = (ref.textContent || "").trim();
          if (t) parts.push(t);
        }
      }
      if (parts.length > 0) return parts.join(" ").slice(0, 60);
    }
    return undefined;
  }

  function walk(root, inShadow) {
    const walker = (root.ownerDocument || document).createTreeWalker(
      root,
      NodeFilter.SHOW_ELEMENT
    );
    let node = walker.nextNode();
    while (node) {
      if (isInteractable(node)) {
        const tag = node.tagName.toLowerCase();
        const placeholder = ("placeholder" in node && node.placeholder)
          ? String(node.placeholder).slice(0, 60) : undefined;
        const altText = ("alt" in node && node.alt)
          ? String(node.alt).slice(0, 60) : undefined;
        const titleAttr = node.getAttribute("title");
        interactables.push({
          testId: node.getAttribute("data-testid") || undefined,
          role: node.getAttribute("role") || undefined,
          accessibleName: getAccessibleName(node),
          label: getLabel(node),
          placeholder: placeholder,
          altText: altText,
          title: titleAttr ? titleAttr.slice(0, 60) : undefined,
          text: ((node.textContent || "").trim().replace(/\\s+/g, " ").slice(0, 60)) || undefined,
          tag: tag,
          inShadowRoot: inShadow || undefined
        });
      }
      if (node.shadowRoot) {
        walk(node.shadowRoot, true);
      }
      node = walker.nextNode();
    }
  }

  if (document.body) walk(document.body, false);
  return interactables;
})()`;

function trimSnapshot(snapshot: string, maxLines: number): string {
  const lines = snapshot.split("\n");
  if (lines.length <= maxLines) return snapshot;
  return lines.slice(0, maxLines).join("\n") + `\n... (${lines.length - maxLines} more lines)`;
}