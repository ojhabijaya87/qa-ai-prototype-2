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
}): AssembledPrompt {
  const prompt = loadSystemPrompt();

  const userParts: string[] = [];
  userParts.push("# Available framework context\n");
  userParts.push(opts.contextMarkdown);
  userParts.push("");

  // Surface the patch flag explicitly so the model's prompt-side decision
  // matches the harness's runtime setting. This is the single switch that
  // turns the "When the POM is missing what you need" section on or off.
  userParts.push("# Configuration");
  userParts.push(`pomPatchesAllowed: ${opts.pomPatchesAllowed ? "true" : "false"}`);
  if (!opts.pomPatchesAllowed) {
    userParts.push(
      "Patches are disabled for this generation. Use ONLY the methods and locators present in the catalogue. " +
      "If the test would need something that isn't available, prefer a less-specific assertion using what exists."
    );
  }
  userParts.push("");

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
