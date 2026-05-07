// Context builder.
//
// Given a Catalogue and a GenRequest, pick the relevant POMs, fixtures, and
// utils to inject into the prompt. This is deliberately deterministic —
// no embeddings yet, just keyword + domain matching. Phase 1b can layer
// pgvector on top for the "similar tests" slot.

import { Catalogue, GenRequest, PomEntry, FixtureEntry, UtilEntry } from "../types.js";

export interface BuiltContext {
  domain: string;
  poms: PomEntry[];
  fixtures: FixtureEntry[];
  utils: UtilEntry[];
}

export function buildContext(catalogue: Catalogue, request: GenRequest): BuiltContext {
  const domain = request.domain ?? inferDomainFromRequest(request.description, catalogue);

  // Filter to the request's domain, plus "common" which applies everywhere.
  const isRelevant = (d: string) => d === domain || d === "common";

  const poms = catalogue.poms.filter((p) => isRelevant(p.domain));
  const fixtures = catalogue.fixtures.filter((f) => isRelevant(f.domain));
  const utils = catalogue.utils.filter((u) => isRelevant(u.domain));

  // Cap each list so we don't blow the context window. Phase 1 uses simple
  // truncation; later phases can rank by relevance to the description.
  return {
    domain,
    poms: poms.slice(0, 5),
    fixtures: fixtures.slice(0, 3),
    utils: utils.slice(0, 8),
  };
}

function inferDomainFromRequest(description: string, catalogue: Catalogue): string {
  const lower = description.toLowerCase();
  // Build a histogram of domains mentioned in the description.
  const domainCounts = new Map<string, number>();
  const allDomains = new Set<string>();
  for (const p of catalogue.poms) allDomains.add(p.domain);
  for (const f of catalogue.fixtures) allDomains.add(f.domain);

  for (const d of allDomains) {
    if (d === "common") continue;
    if (lower.includes(d)) {
      domainCounts.set(d, (domainCounts.get(d) ?? 0) + 1);
    }
  }

  if (domainCounts.size === 0) return "common";
  // Return the most-mentioned domain.
  return [...domainCounts.entries()].sort((a, b) => b[1] - a[1])[0][0];
}

// Render the context as a markdown block for the prompt.
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
      sections.push(`- \`${fx.name}\` from \`${fx.filePath}\` — provides: ${fx.injects.length > 0 ? fx.injects.map((i) => `\`${i}\``).join(", ") : "(no injected props detected)"}`);
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

  return sections.join("\n");
}
