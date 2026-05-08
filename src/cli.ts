// CLI entrypoint.
//
// End-to-end flow:
//   1. Extract the framework catalogue from --repo (or load --catalogue)
//   2. (Optional) Crawl --app-url to ground the model in the live DOM
//   3. Run the generation harness (Ollama call + static-validation retry loop)
//   4. Write the generated test to --out (or stdout if --print)
//   5. (Optional) Run compile + dry-compile validators on the written file
//      so we know the test will *load* before we ship it
//
// All four context sources are stitched together in step 1-2 and passed
// to the harness. The model's context window contains:
//   - framework catalogue (POMs, fixtures, utils, enums, named consts)
//   - 2-3 most-similar existing tests (few-shot)
//   - the live DOM testid list + accessibility outline
//   - the system prompt (framework conventions)
//   - the user's --request

import { Command } from "commander";
import chalk from "chalk";
import { writeFileSync, mkdirSync, existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { extractCatalogue } from "./catalogue/extractor.js";
import { GenerationHarness } from "./harness/loop.js";
import { Catalogue, CrawlResult } from "./types.js";
import { crawlApp } from "./crawler.js";
import { validateCompile } from "./validators/compile.js";
import { validateDryCompile } from "./validators/dry-compile.js";

const program = new Command();

program
  .name("gen-test")
  .description("Generate framework-aligned Playwright tests using a local OSS model")
  .requiredOption("-r, --repo <path>", "path to the framework repo to extract catalogue from")
  .requiredOption("-q, --request <text>", "natural-language description of the test to generate")
  .option("-m, --model <name>", "Ollama model name", "qwen3-coder:30b")
  .option("-o, --out <path>", "output file path (defaults to ./generated-test.spec.ts)")
  .option("--ollama-host <url>", "Ollama host URL", "http://localhost:11434")
  .option("--catalogue <path>", "path to a pre-extracted catalogue JSON (skips extraction)")
  .option("--save-catalogue <path>", "save the extracted catalogue to this path for reuse")
  .option("--max-attempts <n>", "max retry attempts on validation failure", "3")
  .option("--print", "print the generated test to stdout")
  .option("--verbose", "print catalogue summary, prompt details, validation output")
  .option("--app-url <url>", "live application URL to crawl for DOM grounding (default: http://localhost:5173)")
  .option("--routes <routes>", "comma-separated list of routes to crawl (disables auto-discovery)")
  .option("--max-routes <n>", "maximum number of routes to auto-discover", "20")
  .option("--max-depth <n>", "maximum BFS depth for route discovery", "2")
  .option("--no-crawl", "skip the live-app crawl even if --app-url is set")
  .option("--no-validate", "skip post-generation compile + dry-compile validators")
  .option(
    "--allow-pom-patches",
    "allow the model to propose ONE new locator/method on a POM when the catalogue lacks what the test needs (off by default)"
  );

program.parse();
const opts = program.opts();

async function main() {
  console.log(chalk.bold.cyan("\nQA AI prototype — test generation\n"));

  // ── 1. Catalogue ─────────────────────────────────────────────────────
  let catalogue: Catalogue;
  if (opts.catalogue) {
    console.log(chalk.gray(`Loading catalogue from ${opts.catalogue}`));
    catalogue = JSON.parse(readFileSync(opts.catalogue, "utf8"));
  } else {
    console.log(chalk.gray(`Extracting catalogue from ${opts.repo}...`));
    const t0 = Date.now();
    catalogue = await extractCatalogue({ rootPath: path.resolve(opts.repo) });
    console.log(
      chalk.gray(
        `  found ${catalogue.poms.length} POMs, ${catalogue.fixtures.length} fixtures, ${catalogue.utils.length} utils, ${catalogue.enumLikeTypes.length} enums, ${catalogue.namedConstants.length} named consts, ${catalogue.existingTests.length} existing tests in ${Date.now() - t0}ms`
      )
    );
  }

  if (opts.saveCatalogue) {
    writeFileSync(opts.saveCatalogue, JSON.stringify(catalogue, null, 2));
    console.log(chalk.gray(`  saved catalogue to ${opts.saveCatalogue}`));
  }

  if (opts.verbose) {
    const domains = new Set<string>();
    catalogue.poms.forEach((p) => domains.add(p.domain));
    catalogue.fixtures.forEach((f) => domains.add(f.domain));
    console.log(chalk.gray("\nDomains:"));
    for (const d of domains) console.log(chalk.gray(`  - ${d}`));

    if (catalogue.enumLikeTypes.length > 0) {
      console.log(chalk.gray("\nEnum-like types found:"));
      for (const e of catalogue.enumLikeTypes) {
        console.log(chalk.gray(`  - ${e.name}: ${e.members.slice(0, 5).join(" | ")}${e.members.length > 5 ? " | ..." : ""}`));
      }
    }
  }

  // ── 2. Live-app crawl (optional) ─────────────────────────────────────
  let crawl: CrawlResult | undefined;
  // Default the URL to Looksy's dev server if not specified. The user
  // can pass --no-crawl to skip even if this is set.
  const appUrl = opts.appUrl ?? (opts.crawl !== false ? "http://localhost:5173" : undefined);

  if (appUrl && opts.crawl !== false) {
    console.log(chalk.gray(`\nCrawling ${appUrl}...`));
    const t0 = Date.now();
    try {
      crawl = await crawlApp({ 
        appUrl,
        routes: opts.routes ? opts.routes.split(",") : undefined,
        maxRoutes: parseInt(opts.maxRoutes, 10),
        maxDepth: parseInt(opts.maxDepth, 10),
      });
      console.log(
        chalk.gray(
          `  visited ${crawl.routes.length} routes, found ${crawl.allTestIds.length} unique testids in ${Date.now() - t0}ms`
        )
      );
      if (opts.verbose) {
        console.log(chalk.gray(`  testids: ${crawl.allTestIds.slice(0, 12).join(", ")}${crawl.allTestIds.length > 12 ? ", ..." : ""}`));
      }
    } catch (err) {
      console.log(chalk.yellow(`  crawl failed (${(err as Error).message}); continuing without DOM grounding`));
    }
  }

  // ── 3. Generation ────────────────────────────────────────────────────
  const harness = new GenerationHarness({
    model: opts.model,
    ollamaHost: opts.ollamaHost,
    maxAttempts: parseInt(opts.maxAttempts, 10),
    repoPath: path.resolve(opts.repo),
  });

  console.log(chalk.gray(`\nGenerating with model ${opts.model}...`));
  if (opts.allowPomPatches) {
    console.log(chalk.gray("  (POM patches allowed — model may propose one new locator/method)"));
  }
  const result = await harness.generate(catalogue, {
    description: opts.request,
    crawl,
    allowPomPatches: opts.allowPomPatches === true,
  });

  if (!result.ok) {
    console.error(chalk.red("\n✗ Generation failed after"), result.attempts, chalk.red("attempts"));
    if (result.errors) {
      for (const err of result.errors) console.error(chalk.red(`  ${err}`));
    }
    if (result.rejectedPatches && result.rejectedPatches.length > 0) {
      console.error(chalk.yellow("\n  Rejected patch proposals:"));
      for (const p of result.rejectedPatches) {
        console.error(chalk.yellow(`    - ${p.filePath} (${p.className}.${truncate(p.member, 40)}): ${p.reason}`));
      }
    }
    process.exit(1);
  }

  console.log(
    chalk.green(`\n✓ Generated in ${result.durationMs}ms over ${result.attempts} attempt(s)`)
  );

  // Surface patches the model proposed (applied + rejected) so the user
  // sees what touched their framework.
  if (result.appliedPatches && result.appliedPatches.length > 0) {
    console.log(chalk.cyan("\n  POM patches applied:"));
    for (const p of result.appliedPatches) {
      console.log(chalk.cyan(`    + ${p.filePath} (${p.className})`));
      console.log(chalk.gray(`        rationale: ${p.rationale}`));
      console.log(chalk.gray(`        member:    ${truncate(p.member, 80)}`));
    }
  }
  if (result.rejectedPatches && result.rejectedPatches.length > 0) {
    console.log(chalk.yellow("\n  POM patches rejected (not applied):"));
    for (const p of result.rejectedPatches) {
      console.log(chalk.yellow(`    - ${p.filePath} (${p.className}): ${p.reason}`));
    }
  }

  // ── 4. Write output ──────────────────────────────────────────────────
  let writtenPath: string | undefined;
  if (opts.print) {
    console.log("\n" + chalk.bold("--- generated test ---"));
    console.log(result.content);
  }
  if (!opts.print || opts.out) {
    writtenPath = path.resolve(opts.out ?? "./generated-test.spec.ts");
    const outDir = path.dirname(writtenPath);
    if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });
    writeFileSync(writtenPath, result.content!);
    console.log(chalk.green(`  written to ${writtenPath}`));
  }

  // ── 5. Post-generation validators ────────────────────────────────────
  // Only run them if we actually wrote a file; otherwise there's nothing
  // for tsc / playwright --list to point at.
  if (writtenPath && opts.validate !== false) {
    const frameworkRoot = path.resolve(opts.repo);
    console.log(chalk.gray("\nRunning post-generation validators..."));

    const compileResult = await validateCompile({
      filePath: writtenPath,
      frameworkRoot,
    });
    if (compileResult.ok) {
      console.log(chalk.green(`  ✓ compile (${compileResult.durationMs}ms)`));
    } else {
      console.log(chalk.yellow(`  ⚠ compile (${compileResult.durationMs}ms):`));
      console.log(chalk.yellow(`    ${(compileResult.error ?? "").split("\n").slice(0, 5).join("\n    ")}`));
    }

    const playwrightConfig = findPlaywrightConfig(frameworkRoot);
    const dryCompileResult = await validateDryCompile({
      filePath: writtenPath,
      frameworkRoot,
      playwrightConfig,
    });
    if (dryCompileResult.ok) {
      console.log(chalk.green(`  ✓ dry-compile (${dryCompileResult.durationMs}ms)`));
    } else {
      console.log(chalk.yellow(`  ⚠ dry-compile (${dryCompileResult.durationMs}ms):`));
      console.log(chalk.yellow(`    ${(dryCompileResult.error ?? "").split("\n").slice(0, 5).join("\n    ")}`));
    }
  }
}

/**
 * Look for a Playwright config file inside the framework. Common layouts:
 *   - <root>/playwright.config.ts
 *   - <root>/config/playwright.config.ts
 */
function findPlaywrightConfig(frameworkRoot: string): string | undefined {
  const candidates = [
    path.join(frameworkRoot, "playwright.config.ts"),
    path.join(frameworkRoot, "playwright.config.js"),
    path.join(frameworkRoot, "config", "playwright.config.ts"),
  ];
  for (const c of candidates) {
    if (existsSync(c)) return c;
  }
  return undefined;
}

function truncate(s: string, n: number): string {
  const collapsed = s.replace(/\s+/g, " ").trim();
  return collapsed.length > n ? collapsed.slice(0, n - 1) + "…" : collapsed;
}

main().catch((err) => {
  console.error(chalk.red("\nUnhandled error:"), err);
  process.exit(1);
});
