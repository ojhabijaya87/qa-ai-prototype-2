// The harness.
//
// Generation loop: calls Ollama (running Qwen2.5-Coder locally), validates
// the output, retries with the error message fed back if validation fails.
// Caps retries at 3 to bound cost and latency.

import { Ollama } from "ollama";
import { Catalogue, GenRequest, GenResult } from "../types.js";
import { buildContext, renderContextForPrompt } from "../context/builder.js";
import { assemblePrompt } from "../prompts/loader.js";
import { validateGeneratedTest, formatErrorsForRetry } from "../validators/static.js";

export interface HarnessOptions {
  model: string; // e.g. "qwen2.5-coder:7b"
  ollamaHost?: string; // default http://localhost:11434
  maxAttempts?: number;
  temperature?: number;
}

export class GenerationHarness {
  private ollama: Ollama;
  private opts: Required<HarnessOptions>;

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

    for (let attempt = 1; attempt <= this.opts.maxAttempts; attempt++) {
      const prompt = assemblePrompt({
        contextMarkdown,
        userRequest: request.description,
        previousErrors,
      });

      const response = await this.ollama.chat({
        model: this.opts.model,
        messages: [
          { role: "system", content: prompt.system },
          { role: "user", content: prompt.user },
        ],
        options: {
          temperature: this.opts.temperature,
        },
      });

      const rawContent = response.message.content;
      const code = extractCodeBlock(rawContent);

      if (!code) {
        previousErrors = "Your response did not contain a fenced ```ts code block. Output ONLY the test file inside a single ```ts ... ``` block.";
        errorsByAttempt.push(`Attempt ${attempt}: no code block found`);
        continue;
      }

      const validation = validateGeneratedTest(code);

      if (validation.ok) {
        return {
          ok: true,
          content: code,
          attempts: attempt,
          errors: validation.errors.length > 0 ? validation.errors.map((e) => `${e.rule}: ${e.message}`) : undefined,
          durationMs: Date.now() - start,
        };
      }

      previousErrors = formatErrorsForRetry(validation);
      errorsByAttempt.push(`Attempt ${attempt}:\n${previousErrors}`);
    }

    return {
      ok: false,
      attempts: this.opts.maxAttempts,
      errors: errorsByAttempt,
      durationMs: Date.now() - start,
    };
  }
}

function extractCodeBlock(text: string): string | null {
  // Match ```ts ... ``` or ```typescript ... ``` blocks.
  const fence = /```(?:ts|typescript)?\s*\n([\s\S]*?)\n```/;
  const m = text.match(fence);
  return m ? m[1].trim() : null;
}
