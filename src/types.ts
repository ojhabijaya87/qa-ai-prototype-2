// Shared types for the catalogue, context, and validation layers.
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

/**
 * A type alias whose RHS is a literal union — these are gold for the model
 * because they enumerate valid values. E.g.
 *   export type ProductCategory = "outerwear" | "knitwear" | "tops" | ...
 * The model sees the actual valid strings and can't fabricate "jackets".
 */
export interface EnumLikeType {
  name: string;
  filePath: string;
  members: string[];
}

/**
 * Exported `const` objects acting as catalogues of named values, e.g.
 *   export const VARIANTS = { KNIT_MOSS_M: { ... }, TEE_INK_M: { ... } }
 * Surfaced so the model uses VARIANTS.KNIT_MOSS_M instead of inventing
 * a literal object that may have wrong field values.
 */
export interface NamedConstant {
  name: string;
  filePath: string;
  shape: string;
  keys: string[];
}

/**
 * An existing test from the framework's test corpus. Used as a
 * few-shot example. The matchScore is filled in by the context builder
 * after ranking against the request.
 */
export interface SimilarTest {
  filePath: string;
  domain: string;
  testName: string;
  tags: string[];
  excerpt: string;
  matchScore: number;
}

/**
 * Result of crawling the live application before generation. Combines a
 * Playwright accessibility snapshot (semantic structure) with a flat list
 * of every data-testid found in the rendered DOM. This grounds the model
 * in what actually exists at the URL — no fabrication of testids.
 */
export interface CrawlResult {
  appUrl: string;
  scrapedAt: string;
  routes: Array<{
    url: string;
    /** Playwright accessibility tree (structure only, summarised). */
    accessibilitySummary: string;
    /** Every interactable element found on this route with multiple signals. */
    elements: InteractableElement[];
  }>;
  /** All unique testids across all crawled routes, sorted. */
  allTestIds: string[];
}

/**
 * A rich description of an interactable element, providing multiple
 * signals for the model to choose the best Playwright locator.
 */
export interface InteractableElement {
  // Signals, sorted from most stable to least
  testId?: string;         // data-testid (best)
  role?: string;           // ARIA role
  accessibleName?: string; // aria-label or computed name
  label?: string;          // <label for> association
  placeholder?: string;    // input placeholder
  altText?: string;        // image alt
  title?: string;          // title attribute
  text?: string;           // visible text (truncated)
  tag: string;             // fallback only
  // Context
  inIframe?: string;       // frame URL if inside an iframe
  inShadowRoot?: boolean;  // true if traversed shadow boundary
}

export interface Catalogue {
  poms: PomEntry[];
  fixtures: FixtureEntry[];
  utils: UtilEntry[];
  enumLikeTypes: EnumLikeType[];
  namedConstants: NamedConstant[];
  existingTests: SimilarTest[];
  generatedAt: string;
  rootPath: string;
}

export interface GenRequest {
  description: string;
  domain?: string;
  outputDir?: string;
  /** Optional crawl result to inject into the prompt. */
  crawl?: CrawlResult;
  /**
   * If true, the model is allowed to propose adding NEW Locator getters
   * or simple action methods to existing POMs when the catalogue lacks
   * what the test needs. Off by default — patches modify the framework
   * and need explicit opt-in.
   */
  allowPomPatches?: boolean;
}

/**
 * A patch the model proposes against an existing POM file. The patch is
 * deliberately narrow in scope: it can only ADD a new member to an
 * existing class. It cannot modify existing members, change signatures,
 * or restructure files. Anything more invasive than that is rejected.
 */
export interface PomPatch {
  /** Repo-relative path to the POM file to patch (e.g. "pages/order-confirmation.page.ts"). */
  filePath: string;
  /** Class name to patch (must exist in the file). */
  className: string;
  /**
   * The new TypeScript member to add: either a Locator getter or a
   * single short action/state method. The harness inserts this verbatim
   * into the class body just before its closing brace.
   */
  member: string;
  /** Why the patch is needed — model's justification, surfaced to the user. */
  rationale: string;
}

export interface GenResult {
  ok: boolean;
  filePath?: string;
  content?: string;
  attempts: number;
  errors?: string[];
  durationMs: number;
  /** Patches the model proposed AND that passed validation. */
  appliedPatches?: PomPatch[];
  /** Patches the model proposed that were REJECTED, with reasons. */
  rejectedPatches?: Array<PomPatch & { reason: string }>;
}

/**
 * Result of a validation pass against a generated test file. Each
 * validator (static, compile, dry-compile) returns this shape so the
 * harness can layer them uniformly.
 */
export interface ValidationResult {
  ok: boolean;
  /** Layer name for telemetry — "static" | "compile" | "dry-compile". */
  layer: string;
  /** Human-readable error message, suitable for retry feedback. */
  error?: string;
  /** Time the check took, for cost analysis. */
  durationMs: number;
}
