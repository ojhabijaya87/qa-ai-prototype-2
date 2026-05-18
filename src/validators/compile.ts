// Compile-time validator (Layer 4 of the rule enforcement stack).
//
// Runs `tsc --noEmit` against the generated file in the context of the
// framework's tsconfig. Catches:
//   - imports that don't resolve
//   - method calls with wrong argument types
//   - missing return types or wrong return types
//   - any other static type error
//
// Runs AFTER the generated file is written to disk, BEFORE any attempt
// to execute it. Returns errors formatted for retry feedback so the
// model can fix them on the next attempt.

import { spawn } from "node:child_process";
import path from "node:path";
import { existsSync } from "node:fs";
import type { ValidationResult } from "../types.js";

export interface CompileOptions {
  /** Absolute path to the generated test file. */
  filePath: string;
  /** Path to the framework root (where the test will live). */
  frameworkRoot: string;
  /** Optional: explicit tsconfig path, otherwise <frameworkRoot>/tsconfig.json. */
  tsConfigPath?: string;
  /** Cap the validator's runtime — tsc on a large project can be slow. */
  timeoutMs?: number;
}

export async function validateCompile(opts: CompileOptions): Promise<ValidationResult> {
  const start = Date.now();
  const tsConfig = opts.tsConfigPath ?? path.join(opts.frameworkRoot, "tsconfig.json");

  if (!existsSync(tsConfig)) {
    // No tsconfig — skip silently. We don't fail the harness for a missing
    // tsconfig because some frameworks compile via Playwright's runner and
    // don't have one. This is documented in the validator's caller.
    return {
      ok: true,
      layer: "compile",
      durationMs: Date.now() - start,
    };
  }

  if (!existsSync(opts.filePath)) {
    return {
      ok: false,
      layer: "compile",
      error: `compile validator: file not found: ${opts.filePath}`,
      durationMs: Date.now() - start,
    };
  }

  const result = await runProcess(
    "npx",
    ["tsc", "--noEmit", "--project", tsConfig],
    {
      cwd: opts.frameworkRoot,
      timeoutMs: opts.timeoutMs ?? 30_000,
    }
  );

  if (result.exitCode === 0) {
    return { ok: true, layer: "compile", durationMs: Date.now() - start };
  }

  // tsc writes errors to stdout, not stderr. Filter to errors mentioning
  // the generated file so the retry feedback is focused.
  const generatedFileName = path.basename(opts.filePath);
  const focusedErrors = (result.stdout || result.stderr)
    .split("\n")
    .filter((line) => line.includes(generatedFileName) || line.startsWith("error"))
    .slice(0, 20)
    .join("\n");

  return {
    ok: false,
    layer: "compile",
    error: focusedErrors || result.stdout || result.stderr || "tsc failed with no output",
    durationMs: Date.now() - start,
  };
}

interface ProcessResult {
  exitCode: number | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
}

function runProcess(
  cmd: string,
  args: string[],
  opts: { cwd: string; timeoutMs: number }
): Promise<ProcessResult> {
  return new Promise((resolve) => {
    const proc = spawn(cmd, args, {
      cwd: opts.cwd,
      shell: process.platform === "win32",
    });

    let stdout = "";
    let stderr = "";
    let timedOut = false;

    const timer = setTimeout(() => {
      timedOut = true;
      proc.kill("SIGKILL");
    }, opts.timeoutMs);

    proc.stdout.on("data", (d) => (stdout += d.toString()));
    proc.stderr.on("data", (d) => (stderr += d.toString()));

    proc.on("close", (code) => {
      clearTimeout(timer);
      resolve({
        exitCode: timedOut ? -1 : code,
        stdout,
        stderr,
        timedOut,
      });
    });

    proc.on("error", (err) => {
      clearTimeout(timer);
      resolve({
        exitCode: -1,
        stdout,
        stderr: stderr + "\nSpawn error: " + err.message,
        timedOut: false,
      });
    });
  });
}
