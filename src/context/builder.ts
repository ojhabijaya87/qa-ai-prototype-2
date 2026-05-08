// Context builder.
//
// Given a Catalogue + GenRequest, pick the slice of context the model needs:
//   - relevant POMs, fixtures, utilities (filtered by domain)
//   - the full list of enum-like types and named constants (always global)
//   - top 3 similar existing tests as few-shot examples
//   - the crawl result (testids + accessibility outline) — if --app-url was used
//
// Phase 1b can replace keyword scoring with pgvector embeddings, but at
// the catalogue sizes you'd see in a real framework (a few hundred tests,
// tens of POMs), keyword overlap is good enough.

import {
  Catalogue,
  GenRequest,
  PomEntry,
  FixtureEntry,
  UtilEntry,
  EnumLikeType,
  NamedConstant,
  SimilarTest,
  CrawlResult,
} from "../types.js";

export interface BuiltContext {
  domain: string;
  poms: PomEntry[];
  fixtures: FixtureEntry[];
  utils: UtilEntry[];
  enumLikeTypes: EnumLikeType[];
  namedConstants: NamedConstant[];
  similarTests: SimilarTest[];
  crawl?: CrawlResult;
}

export function buildContext(catalogue: Catalogue, request: GenRequest): BuiltContext {
  const domain = request.domain ?? inferDomainFromRequest(request.description, catalogue);
  const isRelevant = (d: string) => d === domain || d === "common";

  return {
    domain,
    poms: catalogue.poms.filter((p) => isRelevant(p.domain)).slice(0, 5),
    fixtures: catalogue.fixtures.filter((f) => isRelevant(f.domain)).slice(0, 3),
    utils: catalogue.utils.filter((u) => isRelevant(u.domain)).slice(0, 8),
    enumLikeTypes: catalogue.enumLikeTypes,
    namedConstants: catalogue.namedConstants,
    similarTests: pickSimilarTests(catalogue.existingTests, request, domain, 3),
    crawl: request.crawl,
  };
}

function inferDomainFromRequest(description: string, catalogue: Catalogue): string {
  const lower = description.toLowerCase();
  const counts = new Map<string, number>();
  const allDomains = new Set<string>();
  for (const p of catalogue.poms) allDomains.add(p.domain);
  for (const f of catalogue.fixtures) allDomains.add(f.domain);

  for (const d of allDomains) {
    if (d === "common") continue;
    if (lower.includes(d)) counts.set(d, (counts.get(d) ?? 0) + 1);
  }
  if (counts.size === 0) return "common";
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
}

/**
 * Rank existing tests by keyword overlap with the request, plus a domain
 * match bonus. Cheap, deterministic, easy to debug.
 */
function pickSimilarTests(
  tests: SimilarTest[],
  request: GenRequest,
  domain: string,
  topN: number
): SimilarTest[] {
  if (tests.length === 0) return [];
  const reqTokens = tokenize(request.description);

  const ranked = tests.map((t) => {
    const overlap = countOverlap(reqTokens, tokenize(t.testName));
    const domainBonus = t.domain === domain ? 0.5 : 0;
    const tagBonus = t.tags.some((tag) => reqTokens.has(tag.replace("@", ""))) ? 0.3 : 0;
    const score = overlap / Math.max(1, reqTokens.size) + domainBonus + tagBonus;
    return { ...t, matchScore: score };
  });

  ranked.sort((a, b) => b.matchScore - a.matchScore);
  return ranked.slice(0, topN);
}

function tokenize(s: string): Set<string> {
  return new Set(
    s
      .toLowerCase()
      .replace(/[^\w\s@-]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 2 && !STOPWORDS.has(w))
  );
}

function countOverlap(a: Set<string>, b: Set<string>): number {
  let count = 0;
  for (const x of a) if (b.has(x)) count++;
  return count;
}

const STOPWORDS = new Set([
  "the", "and", "for", "that", "this", "with", "from", "test", "tests",
  "should", "user", "users", "when", "then", "given", "but", "not", "can",
  "verify", "verifies", "check", "checks", "ensure", "ensures",
]);

// ─── Render to prompt ─────────────────────────────────────────────────────

export function renderContextForPrompt(ctx: BuiltContext): string {
  const sections: string[] = [];

  sections.push(`## Domain: ${ctx.domain}\n`);

  if (ctx.poms.length > 0) {
    sections.push("## Available page objects (use these, do NOT create new ones)\n");
    for (const pom of ctx.poms) {
      sections.push(`### ${pom.className}  \nFile: \`${pom.filePath}\`\n`);
      if (pom.publicLocators.length > 0) {
        sections.push("Locators:");
        for (const loc of pom.publicLocators) {
          sections.push(`- \`${loc.name}: ${loc.type}\``);
        }
      }
      if (pom.publicMethods.length > 0) {
        sections.push("\nMethods:");
        for (const m of pom.publicMethods) {
          sections.push(`- \`${m.isAsync ? "async " : ""}${m.name}(${m.params}): ${m.returnType}\``);
        }
      }
      sections.push("");
    }
  }

  if (ctx.fixtures.length > 0) {
    sections.push("## Available fixtures (import from these — never `import { test } from '@playwright/test'` directly)\n");
    for (const fx of ctx.fixtures) {
      const provides = fx.injects.length > 0
        ? fx.injects.map((i) => `\`${i}\``).join(", ")
        : "(no injected props detected)";
      sections.push(`- \`${fx.name}\` from \`${fx.filePath}\` — provides: ${provides}`);
    }
    sections.push("");
  }

  if (ctx.utils.length > 0) {
    sections.push("## Available utilities (import from these, do NOT duplicate)\n");
    for (const u of ctx.utils) {
      sections.push(`- \`${u.signature}\` (${u.filePath})`);
    }
    sections.push("");
  }

  if (ctx.enumLikeTypes.length > 0) {
    sections.push("## Valid values for typed arguments\n");
    sections.push("These types have a fixed set of allowed values. Use ONLY these — do not invent new strings.\n");
    for (const e of ctx.enumLikeTypes) {
      sections.push(`- \`${e.name}\`: ${e.members.map((m) => `"${m}"`).join(" | ")}`);
    }
    sections.push("");
  }

  if (ctx.namedConstants.length > 0) {
    sections.push("## Available test data catalogues (use these named constants, do NOT inline values)\n");
    for (const c of ctx.namedConstants) {
      sections.push(`- \`${c.name}\` from \`${c.filePath}\` — keys: ${c.keys.map((k) => `\`${k}\``).join(", ")}`);
    }
    sections.push("");
  }

  if (ctx.crawl) {
    sections.push(renderCrawl(ctx.crawl));
  }

  if (ctx.similarTests.length > 0) {
    sections.push("## Reference tests in this framework (match the style and conventions of these)\n");
    for (const t of ctx.similarTests) {
      sections.push(`### ${t.testName}  \nFrom \`${t.filePath}\`:\n`);
      sections.push("```ts");
      sections.push(t.excerpt);
      sections.push("```\n");
    }
  }

  return sections.join("\n");
}

function renderCrawl(crawl: CrawlResult): string {
  const lines: string[] = [];
  lines.push("## Live application crawl\n");
  lines.push(`Crawled \`${crawl.appUrl}\` at ${crawl.scrapedAt}. The data below comes from the actual rendered DOM. Use these signals to pick the best Playwright locator (priority: testid > role > label > placeholder).\n`);

  for (const route of crawl.routes) {
    lines.push(`### Route: ${route.url}\n`);
    
    // Accessibility tree
    lines.push("#### Page structure (accessibility tree)");
    lines.push("```");
    lines.push(route.accessibilitySummary.trim() || "(empty)");
    lines.push("```\n");

    // Interactable elements table
    if (route.elements.length > 0) {
      lines.push("#### Interactable elements");
      lines.push("| Signal (Best Available) | Role | Text/Name | Context |");
      lines.push("| :--- | :--- | :--- | :--- |");
      
      // Cap per-route elements to avoid blowing the prompt budget
      const displayElements = route.elements.slice(0, 50);
      for (const el of displayElements) {
        const signal = el.testId ? `testid="${el.testId}"` : 
                      el.placeholder ? `placeholder="${el.placeholder}"` :
                      el.altText ? `alt="${el.altText}"` :
                      el.title ? `title="${el.title}"` :
                      `tag: ${el.tag}`;
        
        const context = [
          el.inIframe ? "iframe" : "",
          el.inShadowRoot ? "shadow" : ""
        ].filter(Boolean).join(", ") || "main";

        lines.push(`| ${signal} | ${el.role ?? el.tag} | ${el.accessibleName ?? el.text ?? "-"} | ${context} |`);
      }
      
      if (route.elements.length > displayElements.length) {
        lines.push(`| ... and ${route.elements.length - displayElements.length} more | | | |`);
      }
      lines.push("");
    }
  }

  return lines.join("\n");
}
