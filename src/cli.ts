// CLI entrypoint.
//
// Usage:
//   pnpm gen --repo /path/to/framework --request "test that a guest can checkout with Klarna"
//   pnpm gen --repo . --request "..." --model qwen2.5-coder:7b --out ./tests/checkout/
//
// The CLI does three things:
//   1. Extracts the catalogue from --repo (or loads cached if --catalogue given)
//   2. Runs the harness loop against Ollama
//   3. Writes the result to --out (or stdout if --print)

import { Command } from "commander";
import chalk from "chalk";
import { writeFileSync, mkdirSync, existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { extractCatalogue } from "./catalogue/extractor.js";
import { GenerationHarness } from "./harness/loop.js";
import { Catalogue } from "./types.js";

const program = new Command();

program
  .name("gen-test")
  .description("Generate framework-aligned Playwright tests using a local OSS model")
  .requiredOption("-r, --repo <path>", "path to the framework repo to extract catalogue from")
  .requiredOption("-q, --request <text>", "natural-language description of the test to generate")
  .option("-m, --model <name>", "Ollama model name", "qwen2.5-coder:7b")
  .option("-o, --out <path>", "output file path (defaults to ./generated-test.spec.ts)")
  .option("--ollama-host <url>", "Ollama host URL", "http://localhost:11434")
  .option("--catalogue <path>", "path to a pre-extracted catalogue JSON (skips extraction)")
  .option("--save-catalogue <path>", "save the extracted catalogue to this path for reuse")
  .option("--max-attempts <n>", "max retry attempts on validation failure", "3")
  .option("--print", "print the generated test to stdout instead of writing to file")
  .option("--verbose", "print catalogue summary and prompt details");

program.parse();
const opts = program.opts();

async function main() {
  console.log(chalk.bold.cyan("\nQA AI prototype — test generation\n"));

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
        `  found ${catalogue.poms.length} POMs, ${catalogue.fixtures.length} fixtures, ${catalogue.utils.length} utils in ${Date.now() - t0}ms`
      )
    );
  }

  if (opts.saveCatalogue) {
    writeFileSync(opts.saveCatalogue, JSON.stringify(catalogue, null, 2));
    console.log(chalk.gray(`  saved catalogue to ${opts.saveCatalogue}`));
  }

  if (opts.verbose) {
    console.log(chalk.gray("\nDomains found:"));
    const domains = new Set<string>();
    catalogue.poms.forEach((p) => domains.add(p.domain));
    catalogue.fixtures.forEach((f) => domains.add(f.domain));
    for (const d of domains) console.log(chalk.gray(`  - ${d}`));
  }

  const harness = new GenerationHarness({
    model: opts.model,
    ollamaHost: opts.ollamaHost,
    maxAttempts: parseInt(opts.maxAttempts, 10),
  });

  console.log(chalk.gray(`\nGenerating with model ${opts.model}...`));
  const result = await harness.generate(catalogue, { description: opts.request });

  if (!result.ok) {
    console.error(chalk.red("\n✗ Generation failed after"), result.attempts, chalk.red("attempts"));
    if (result.errors) {
      for (const err of result.errors) {
        console.error(chalk.red(`  ${err}`));
      }
    }
    process.exit(1);
  }

  console.log(
    chalk.green(`\n✓ Generated in ${result.durationMs}ms over ${result.attempts} attempt(s)`)
  );

  if (opts.print) {
    console.log("\n" + chalk.bold("--- generated test ---"));
    console.log(result.content);
  } else {
    const outPath = opts.out ?? "./generated-test.spec.ts";
    const outDir = path.dirname(outPath);
    if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });
    writeFileSync(outPath, result.content!);
    console.log(chalk.green(`  written to ${outPath}`));
  }
}

main().catch((err) => {
  console.error(chalk.red("\nUnhandled error:"), err);
  process.exit(1);
});
