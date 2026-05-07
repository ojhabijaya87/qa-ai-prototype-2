// Shared types for the catalogue and context layers.
// Keep these light — they describe what the LLM sees, not the full TS AST.

export interface PomEntry {
  className: string;
  filePath: string;
  domain: string; // inferred from path: tests/checkout/* -> "checkout"
  publicLocators: LocatorEntry[];
  publicMethods: MethodSignature[];
}

export interface LocatorEntry {
  name: string;
  type: string; // "Locator", "Promise<Locator>", etc.
}

export interface MethodSignature {
  name: string;
  params: string;
  returnType: string;
  isAsync: boolean;
}

export interface FixtureEntry {
  name: string; // exported test fixture name
  filePath: string;
  domain: string;
  injects: string[]; // what fixtures this one provides (e.g. ["cartPage", "checkoutPage"])
}

export interface UtilEntry {
  name: string;
  filePath: string;
  domain: string;
  signature: string; // one-line type signature
}

export interface SimilarTest {
  filePath: string;
  domain: string;
  excerpt: string; // trimmed test body, ~30 lines max
}

export interface Catalogue {
  poms: PomEntry[];
  fixtures: FixtureEntry[];
  utils: UtilEntry[];
  generatedAt: string;
  rootPath: string;
}

export interface GenRequest {
  description: string; // user's natural-language request
  domain?: string; // optional explicit domain override
  outputDir?: string; // where to write the resulting .spec.ts
}

export interface GenResult {
  ok: boolean;
  filePath?: string;
  content?: string;
  attempts: number;
  errors?: string[];
  durationMs: number;
}
