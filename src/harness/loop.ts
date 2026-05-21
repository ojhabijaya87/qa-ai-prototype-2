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
//
// v0.4.0: Added lightweight planner (autoPatch) that runs before generation
// to detect missing POM members and automatically apply patches using a small
// model. This drastically reduces hallucinations.

import { Ollama } from "ollama";
import { Catalogue, GenRequest, GenResult, PomPatch } from "../types.js";
import { buildContext, renderCompactContextForPrompt } from "../context/builder.js";
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
import { planTest } from "../planner/lightweight-planner.js";
import { extractCatalogue } from "../catalogue/extractor.js";

// Increase Undici headers timeout (Ollama uses fetch). This is a safe fallback.
if (typeof process !== "undefined") {
  process.env.UNDICI_HEADERS_TIMEOUT = "900000";
  process.env.UNDICI_BODY_TIMEOUT = "900000";
}

export interface HarnessOptions {
  model: string; // e.g. "qwen3-coder:30b"
  ollamaHost?: string; // default http://localhost:11434
  maxAttempts?: number;
  temperature?: number;
  /** Path to the framework repo for compile validation. */
  repoPath?: string;
  /** Small, fast model used for the planning phase (default: qwen2.5-coder:1.5b). */
  plannerModel?: string;
  /** If true, automatically apply patches discovered by the planner. */
  autoPatch?: boolean;
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
      plannerModel: "qwen2.5-coder:1.5b",
      autoPatch: false,
      ...opts,
    };
    this.ollama = new Ollama({ host: this.opts.ollamaHost });
  }

  async generate(catalogue: Catalogue, request: GenRequest): Promise<GenResult> {
    const start = Date.now();
    const ctx = buildContext(catalogue, request);
    const contextMarkdown = renderCompactContextForPrompt(ctx);

    // ─── Lightweight planner (auto-patch) ────────────────────────────────
    let currentCatalogue = catalogue;
    if (this.opts.autoPatch && request.allowPomPatches) {
      console.log(`\n🧠 Running planner (model: ${this.opts.plannerModel})...`);
      const plan = await planTest(request.description, currentCatalogue, {
        plannerModel: this.opts.plannerModel,
        ollamaHost: this.opts.ollamaHost,
      });
      if (!plan.success) {
        console.warn(`  Planner failed: ${plan.error}. Continuing without patches.`);
      } else if (plan.missingMembers.length > 0) {
        console.log(`  Planner found ${plan.missingMembers.length} missing POM member(s):`);
        for (const m of plan.missingMembers) {
          console.log(`    - ${m.className}.${m.name} (${m.memberType})`);
        }
        const appliedFiles: PatchedFile[] = [];
        const repoRoot = this.opts.repoPath ?? process.cwd();
        for (const member of plan.missingMembers) {
          const pomPath = findPomFileForClass(currentCatalogue, member.className);
          if (!pomPath) {
            console.warn(`    Cannot find file for class ${member.className}, skipping.`);
            continue;
          }
          let memberCode: string;
          if (member.memberType === "locator") {
            if (member.body && member.body.trim().startsWith("get ")) {
              memberCode = member.body;
            } else {
              memberCode = `get ${member.name}(): Locator { return this.page.getByTestId('${member.name}'); }`;
            }
          } else {
            memberCode = `${member.signature} {\n  ${member.body}\n}`;
          }
          const patch: PomPatch = {
            filePath: pomPath,
            className: member.className,
            member: memberCode,
            rationale: member.rationale,
          };
          const validation = validatePatch(patch, repoRoot);
          if (!validation.ok) {
            console.warn(`    Patch for ${member.name} rejected: ${validation.error}`);
            continue;
          }
          try {
            appliedFiles.push(applyPatch(patch, repoRoot));
            console.log(`    ✓ Applied ${member.className}.${member.name}`);
          } catch (err) {
            console.warn(`    Failed to apply patch: ${(err as Error).message}`);
          }
        }
        if (appliedFiles.length > 0) {
          console.log("  Re‑extracting catalogue after patches...");
          const newCatalogue = await extractCatalogue({ rootPath: this.opts.repoPath ?? process.cwd() });
          currentCatalogue = newCatalogue;
          console.log(`  Catalogue updated (${currentCatalogue.poms.length} POMs now).`);
        }
      }
    }

    let previousErrors: string | undefined;
    const errorsByAttempt: string[] = [];
    const allRejectedPatches: Array<PomPatch & { reason: string }> = [];

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
          targetFileRelative: request.targetFileRelative,
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

        // ────────────────────────────────────────────────────────────────
        // Write the test to the final output path immediately
        // (even if validation fails later). This ensures the generated
        // file is preserved for manual inspection.
        // ────────────────────────────────────────────────────────────────
        if (request.targetFileRelative) {
          const finalOutputPath = path.join(this.opts.repoPath ?? process.cwd(), request.targetFileRelative);
          const outDir = path.dirname(finalOutputPath);
          if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });
          writeFileSync(finalOutputPath, testCode);
          console.log(`  (wrote attempt ${attempt} to ${finalOutputPath})`);
        }

        // ─── Patch handling ────────────────────────────────────────────
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

        // ─── Compile validation ───────────────────────────────────────
        if (this.opts.repoPath) {
          writeFileSync(tempFile, testCode);
          const appliedFiles: PatchedFile[] = [];
          for (const patch of validatedPatches) {
            try {
              appliedFiles.push(applyPatch(patch, repoRoot));
            } catch (err) {
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

          rollbackPatches(appliedFiles);
          previousErrors = `Your code has TypeScript compilation errors:\n${compileResult.error}\n\nPlease fix these errors.`;
          errorsByAttempt.push(`Attempt ${attempt} (Compile Error):\n${compileResult.error}`);
          continue;
        }

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
      try { unlinkSync(tempFile); } catch { /* ignore */ }
    }
  }
}

function extractCodeBlocks(text: string): {
  testCode: string | null;
  patches: Array<{ filePath: string; payload: string }>;
} {
  const patches: Array<{ filePath: string; payload: string }> = [];
  const patchFence = /```ts:patch:([^\s`]+)\s*\n([\s\S]*?)\n```/g;
  let match: RegExpExecArray | null;
  while ((match = patchFence.exec(text)) !== null) {
    patches.push({ filePath: match[1].trim(), payload: match[2].trim() });
  }
  const withoutPatches = text.replace(patchFence, "");
  const testFence = /```(?:ts|typescript)\s*\n([\s\S]*?)\n```/;
  const testMatch = withoutPatches.match(testFence);
  const testCode = testMatch ? testMatch[1].trim() : null;
  return { testCode, patches };
}

function findPomFileForClass(catalogue: Catalogue, className: string): string | undefined {
  const pom = catalogue.poms.find(p => p.className === className);
  return pom?.filePath;
}