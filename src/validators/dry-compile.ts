// Dry-compile validator (Layer 5 of the rule enforcement stack).
//
// Runs `playwright test <file> --list`, which loads and parses the test
// file inside Playwright's test runner WITHOUT executing the test body.
// Catches things tsc misses:
//   - test name + fixture mismatches that only surface at registration
//   - import path errors that resolve at compile time but fail at runtime
//   - top-level errors in the spec file
//
// Cheap (no browser, no network), runs in 2-5 seconds. Use it as the
// final gate before declaring a generation successful.
//
// FULL execution (--list-tests removed, actually run the test) is opt-in
// behind a separate flag because it requires the Looksy app to be running
// and adds 30+ seconds per attempt.

import { spawn } from "node:child_process";
import path from "node:path";
import { existsSync } from "node:fs";
import type { ValidationResult } from "../types.js";

export interface DryCompileOptions {
  filePath: string;
  frameworkRoot: string;
  /** Path to the Playwright config inside the framework. */
  playwrightConfig?: string;
  timeoutMs?: number;
}

export async function validateDryCompile(opts: DryCompileOptions): Promise<ValidationResult> {
  const start = Date.now();

  if (!existsSync(opts.filePath)) {
    return {
      ok: false,
      layer: "dry-compile",
      error: `dry-compile validator: file not found: ${opts.filePath}`,
      durationMs: Date.now() - start,
    };
  }

  const args = ["playwright", "test", opts.filePath, "--list"];
  if (opts.playwrightConfig) {
    args.push("--config", opts.playwrightConfig);
  }

  const result = await runProcess("npx", args, {
    cwd: opts.frameworkRoot,
    timeoutMs: opts.timeoutMs ?? 20_000,
  });

  if (result.exitCode === 0) {
    return { ok: true, layer: "dry-compile", durationMs: Date.now() - start };
  }

  // Playwright prints registration errors to stderr in --list mode.
  // Trim to the most relevant lines for the retry message.
  const errLines = (result.stderr || result.stdout)
    .split("\n")
    .filter((l) => l.trim().length > 0)
    .slice(0, 30)
    .join("\n");

  return {
    ok: false,
    layer: "dry-compile",
    error: errLines || "playwright --list failed with no output",
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
