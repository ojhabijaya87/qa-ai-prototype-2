// Prompt loader and assembler.
// Reads the versioned YAML prompt and stitches it together with the request
// and the rendered context.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import YAML from "yaml";

interface PromptFile {
  version: string;
  framework: string;
  system: string;
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let cached: PromptFile | null = null;

export function loadSystemPrompt(): PromptFile {
  if (cached) return cached;
  const promptPath = path.join(__dirname, "test-generation.yaml");
  const raw = readFileSync(promptPath, "utf8");
  cached = YAML.parse(raw) as PromptFile;
  return cached;
}

export interface AssembledPrompt {
  system: string;
  user: string;
  version: string;
}

export function assemblePrompt(opts: {
  contextMarkdown: string;
  userRequest: string;
  previousErrors?: string;
  /** When true, the prompt tells the model it may emit a patch block. */
  pomPatchesAllowed?: boolean;
  /**
   * Where the generated test will be written, relative to the framework
   * root. Used to compute the right `../` depth for fixture/util imports.
   */
  targetFileRelative?: string;
}): AssembledPrompt {
  const prompt = loadSystemPrompt();

  const userParts: string[] = [];
  userParts.push("# Available framework context\n");
  userParts.push(opts.contextMarkdown);
  userParts.push("");

  // ── Output file location & import prefix ───────────────────────────
  if (opts.targetFileRelative) {
    const importPrefix = computeImportPrefix(opts.targetFileRelative);
    userParts.push("# Output file location");
    userParts.push(
      `This test will be written to \`${opts.targetFileRelative}\` (relative to the framework root).`
    );
    userParts.push(
      `When importing fixtures, factories, and utilities, the relative-path prefix is \`${importPrefix}\`. ` +
      `For example, the fixtures module at \`fixtures/looksy.fixture.ts\` must be imported as ` +
      `\`${importPrefix}fixtures/looksy.fixture\`.`
    );
    userParts.push("");
  }

  // ── Configuration ───────────────────────────────────────────────────
  userParts.push("# Configuration");
  userParts.push(`pomPatchesAllowed: ${opts.pomPatchesAllowed ? "true" : "false"}`);
  if (!opts.pomPatchesAllowed) {
    userParts.push(
      "Patches are disabled for this generation. Use ONLY the methods and locators present in the catalogue. " +
      "If the test would need something that isn't available, prefer a less-specific assertion using what exists."
    );
  }
  userParts.push("");

  // ── Your task ───────────────────────────────────────────────────────
  userParts.push("# Your task");
  userParts.push(opts.userRequest);

  if (opts.previousErrors) {
    userParts.push("");
    userParts.push("# Your previous attempt failed validation");
    userParts.push("Errors from the previous attempt:");
    userParts.push("```");
    userParts.push(opts.previousErrors);
    userParts.push("```");
    userParts.push("Fix these errors in your next attempt. Output the corrected file only.");
  }

  return {
    system: prompt.system,
    user: userParts.join("\n"),
    version: prompt.version,
  };
}

/**
 * Compute the `../` prefix needed to import from the framework root, given
 * a target file path expressed relative to that same root.
 *
 *   tests/foo.spec.ts           -> "../"
 *   tests/generated/foo.spec.ts -> "../../"
 *   tests/a/b/c/foo.spec.ts     -> "../../../../"
 */
function computeImportPrefix(targetFileRelative: string): string {
  const segments = targetFileRelative.split(/[/\\]/).filter((s) => s.length > 0);
  // Exclude the last segment (filename) – we need only directory depth.
  const depth = Math.max(0, segments.length - 1);
  if (depth === 0) return "./";
  return "../".repeat(depth);
}

let plannerCached: PromptFile | null = null;
export function loadPlannerPrompt(): PromptFile {
  if (plannerCached) return plannerCached;
  const promptPath = path.join(__dirname, "planner.yaml");
  const raw = readFileSync(promptPath, "utf8");
  plannerCached = YAML.parse(raw) as PromptFile;
  return plannerCached;
}