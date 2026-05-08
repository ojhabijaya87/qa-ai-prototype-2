// The harness.
//
// Generation loop: calls Ollama (running Qwen3-Coder locally), validates
// the output, retries with the error message fed back if validation fails.
// Caps retries at 3 to bound cost and latency.
//
// As of v0.3.0, the harness also supports POM patches (Option B): when
// allowPomPatches is enabled in the request, the model may emit a second
// fenced block describing a SINGLE new member to add to a POM. Patches
// go through validatePatch -> applyPatch -> compile validation. If compile
// fails, the patches are rolled back so the framework files stay clean.

import { Ollama } from "ollama";
import { Catalogue, GenRequest, GenResult, PomPatch } from "../types.js";
import { buildContext, renderContextForPrompt } from "../context/builder.js";
import { assemblePrompt } from "../prompts/loader.js";
import { validateGeneratedTest, formatErrorsForRetry } from "../validators/static.js";
import { validateCompile } from "../validators/compile.js";
import {
  parsePatchPayload,
  validatePatch,
  applyPatch,
  rollbackPatches,
  PatchedFile,
} from "../validators/patch.js";
import { writeFileSync, mkdirSync, existsSync, unlinkSync } from "node:fs";
import path from "node:path";

export interface HarnessOptions {
  model: string; // e.g. "qwen3-coder:30b"
  ollamaHost?: string; // default http://localhost:11434
  maxAttempts?: number;
  temperature?: number;
  /** Path to the framework repo for compile validation. */
  repoPath?: string;
}

/**
 * Thrown when Ollama responds with a "model not found" style error. We
 * catch the raw Ollama API error and re-throw with a clearer message
 * pointing the user at the right `ollama pull` command — much friendlier
 * than the cryptic "model 'foo' not found, try pulling it first" string.
 */
export class ModelNotFoundError extends Error {
  constructor(modelName: string) {
    super(
      `Ollama does not have the model "${modelName}" available locally.\n\n` +
        `Pull it first:\n` +
        `  ollama pull ${modelName}\n\n` +
        `Then verify with:\n` +
        `  ollama list`
    );
    this.name = "ModelNotFoundError";
  }
}

export class GenerationHarness {
  private ollama: Ollama;
  private opts: Required<Omit<HarnessOptions, "repoPath">> & Pick<HarnessOptions, "repoPath">;

  constructor(opts: HarnessOptions) {
    this.opts = {
      ollamaHost: "http://localhost:11434",
      maxAttempts: 3,
      temperature: 0.2,
      ...opts,
    };
    this.ollama = new Ollama({ host: this.opts.ollamaHost });
  }

  async generate(catalogue: Catalogue, request: GenRequest): Promise<GenResult> {
    const start = Date.now();
    const ctx = buildContext(catalogue, request);
    const contextMarkdown = renderContextForPrompt(ctx);

    let previousErrors: string | undefined;
    const errorsByAttempt: string[] = [];
    const allRejectedPatches: Array<PomPatch & { reason: string }> = [];

    // Temp file for compile validation. CRITICAL: lives inside the framework's
    // tests/ directory, NOT process.cwd(). Generated tests use relative imports
    // like `../fixtures/looksy.fixture` that only resolve when the temp
    // file is two folders deep within the framework root.
    const repoRoot = this.opts.repoPath ?? process.cwd();
    const tempDir = path.join(repoRoot, "tests", ".temp_gen");
    if (!existsSync(tempDir)) mkdirSync(tempDir, { recursive: true });
    const tempFile = path.join(tempDir, `healing_${Date.now()}.spec.ts`);

    try {
      for (let attempt = 1; attempt <= this.opts.maxAttempts; attempt++) {
        const prompt = assemblePrompt({
          contextMarkdown,
          userRequest: request.description,
          previousErrors,
          pomPatchesAllowed: request.allowPomPatches === true,
        });

        let response;
        try {
          response = await this.ollama.chat({
            model: this.opts.model,
            messages: [
              { role: "system", content: prompt.system },
              { role: "user", content: prompt.user },
            ],
            options: {
              temperature: this.opts.temperature,
            },
          });
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          if (/model.*not found|pull (it|the model)/i.test(msg)) {
            throw new ModelNotFoundError(this.opts.model);
          }
          throw err;
        }

        const rawContent = response.message.content;
        const { testCode, patches: rawPatches } = extractCodeBlocks(rawContent);

        if (!testCode) {
          previousErrors =
            "Your response did not contain a fenced ```ts code block with the test. " +
            "Output the test inside a single ```ts ... ``` block.";
          errorsByAttempt.push(`Attempt ${attempt}: no test code block found`);
          continue;
        }

        // ─── Patch handling ────────────────────────────────────────────
        // Only honour patches when explicitly allowed. If the model emits
        // patches anyway (which it shouldn't, given the prompt), we treat
        // them as rejected with a clear reason so the user sees what
        // happened.
        const validatedPatches: PomPatch[] = [];
        if (rawPatches.length > 0) {
          if (request.allowPomPatches !== true) {
            for (const raw of rawPatches) {
              const parsed = parsePatchPayload(raw.filePath, raw.payload);
              const stub = parsed.patch ?? {
                filePath: raw.filePath,
                className: "(unparsed)",
                member: "(unparsed)",
                rationale: parsed.error ?? "unparseable patch payload",
              };
              allRejectedPatches.push({ ...stub, reason: "POM patches not allowed for this generation (--allow-pom-patches not set)" });
            }
          } else if (rawPatches.length > 1) {
            // Rule P1: at most one patch per generation.
            for (const raw of rawPatches) {
              const parsed = parsePatchPayload(raw.filePath, raw.payload);
              const stub = parsed.patch ?? {
                filePath: raw.filePath,
                className: "(unparsed)",
                member: "(unparsed)",
                rationale: parsed.error ?? "unparseable patch payload",
              };
              allRejectedPatches.push({ ...stub, reason: "more than one patch proposed in a single generation (rule P1)" });
            }
          } else {
            const raw = rawPatches[0];
            const parsed = parsePatchPayload(raw.filePath, raw.payload);
            if (parsed.error || !parsed.patch) {
              allRejectedPatches.push({
                filePath: raw.filePath,
                className: "(unknown)",
                member: "(unparsed)",
                rationale: "(unparsed)",
                reason: parsed.error ?? "unknown parse error",
              });
            } else {
              const validation = validatePatch(parsed.patch, repoRoot);
              if (validation.ok) {
                validatedPatches.push(parsed.patch);
              } else {
                allRejectedPatches.push({
                  ...parsed.patch,
                  reason: validation.error ?? "unknown validation error",
                });
              }
            }
          }
        }

        // ─── Static validation ─────────────────────────────────────────
        const validation = validateGeneratedTest(testCode);
        if (!validation.ok) {
          previousErrors = formatErrorsForRetry(validation);
          errorsByAttempt.push(`Attempt ${attempt}:\n${previousErrors}`);
          continue;
        }

        // ─── Compile validation, optionally with patches applied ───────
        if (this.opts.repoPath) {
          writeFileSync(tempFile, testCode);

          // Apply validated patches BEFORE compile. If compile fails, we
          // roll them back so the framework stays clean.
          const appliedFiles: PatchedFile[] = [];
          for (const patch of validatedPatches) {
            try {
              appliedFiles.push(applyPatch(patch, repoRoot));
            } catch (err) {
              // applyPatch only throws if the file shape changed since
              // validation — extremely unlikely, but handle it.
              allRejectedPatches.push({
                ...patch,
                reason: `apply failed after validation passed: ${(err as Error).message}`,
              });
            }
          }

          const compileResult = await validateCompile({
            filePath: tempFile,
            frameworkRoot: this.opts.repoPath,
          });

          if (compileResult.ok) {
            // Success — leave patches in place.
            return {
              ok: true,
              content: testCode,
              attempts: attempt,
              errors: validation.errors.length > 0
                ? validation.errors.map((e) => `${e.rule}: ${e.message}`)
                : undefined,
              durationMs: Date.now() - start,
              appliedPatches: validatedPatches.length > 0 ? validatedPatches : undefined,
              rejectedPatches: allRejectedPatches.length > 0 ? allRejectedPatches : undefined,
            };
          }

          // Compile failed — roll back any patches and feed the error
          // back into the next attempt.
          rollbackPatches(appliedFiles);
          previousErrors = `Your code has TypeScript compilation errors:\n${compileResult.error}\n\nPlease fix these errors.`;
          errorsByAttempt.push(`Attempt ${attempt} (Compile Error):\n${compileResult.error}`);
          continue;
        }

        // No repoPath: skip compile, accept the test as-is.
        return {
          ok: true,
          content: testCode,
          attempts: attempt,
          errors: validation.errors.length > 0
            ? validation.errors.map((e) => `${e.rule}: ${e.message}`)
            : undefined,
          durationMs: Date.now() - start,
          appliedPatches: validatedPatches.length > 0 ? validatedPatches : undefined,
          rejectedPatches: allRejectedPatches.length > 0 ? allRejectedPatches : undefined,
        };
      }

      return {
        ok: false,
        attempts: this.opts.maxAttempts,
        errors: errorsByAttempt,
        durationMs: Date.now() - start,
        rejectedPatches: allRejectedPatches.length > 0 ? allRejectedPatches : undefined,
      };
    } finally {
      // Always clean up the temp file.
      try { unlinkSync(tempFile); } catch { /* ignore */ }
    }
  }
}

/**
 * Extract code blocks from the model's response. The model now emits up
 * to two blocks:
 *   1. The test, fenced as ```ts (or ```typescript)
 *   2. (Optional) A patch, fenced as ```ts:patch:<repo-relative-path>
 *
 * Returns the test code (required) and any patch blocks (zero or more,
 * though the prompt asks for at most one). The caller decides what to
 * do with the patches based on whether patching is enabled.
 */
function extractCodeBlocks(text: string): {
  testCode: string | null;
  patches: Array<{ filePath: string; payload: string }>;
} {
  const patches: Array<{ filePath: string; payload: string }> = [];

  // Patch blocks: ```ts:patch:<path>\n<payload>\n```
  // The path can contain forward-slashes and dots but no whitespace or backticks.
  const patchFence = /```ts:patch:([^\s`]+)\s*\n([\s\S]*?)\n```/g;
  let match: RegExpExecArray | null;
  while ((match = patchFence.exec(text)) !== null) {
    patches.push({ filePath: match[1].trim(), payload: match[2].trim() });
  }

  // Strip patch blocks before searching for the test block, otherwise the
  // generic ```ts regex below will match a patch block first.
  const withoutPatches = text.replace(patchFence, "");

  // Test block: ```ts ... ``` or ```typescript ... ```. We deliberately do
  // not match an empty info string ``` because the model occasionally emits
  // a stray fenced block of prose; insisting on the language tag avoids that.
  const testFence = /```(?:ts|typescript)\s*\n([\s\S]*?)\n```/;
  const testMatch = withoutPatches.match(testFence);
  const testCode = testMatch ? testMatch[1].trim() : null;

  return { testCode, patches };
}
