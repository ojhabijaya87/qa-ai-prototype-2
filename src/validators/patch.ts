// POM patch validator and applier.
//
// When the model proposes a patch (Option B), this module is the gate:
// it parses the patch JSON, validates it against a strict set of rules,
// then applies it in-memory before compile validation. If compile
// validation fails, the patch is rolled back so the framework files
// stay clean.
//
// The validation rules deliberately reject anything we can't verify is
// safe. Better to drop a borderline patch and tell the user "consider
// adding X manually" than to silently mutate their framework with a
// patch we can't reason about.

import { Project, SyntaxKind, ClassDeclaration } from "ts-morph";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { PomPatch } from "../types.js";

export interface PatchValidationResult {
  ok: boolean;
  error?: string;
}

export interface PatchedFile {
  filePath: string;
  originalContent: string;
}

/**
 * Parse a patch code block payload (the JSON inside the fenced block)
 * into a PomPatch, with the filePath taken from the fence header.
 *
 * Returns null and a reason if the payload is malformed.
 */
export function parsePatchPayload(
  filePath: string,
  payload: string
): { patch?: PomPatch; error?: string } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(payload);
  } catch (err) {
    return { error: `patch payload is not valid JSON: ${(err as Error).message}` };
  }

  if (!parsed || typeof parsed !== "object") {
    return { error: "patch payload must be a JSON object" };
  }
  const obj = parsed as Record<string, unknown>;

  if (typeof obj.className !== "string" || obj.className.length === 0) {
    return { error: "patch payload missing required field 'className' (string)" };
  }
  if (typeof obj.member !== "string" || obj.member.length === 0) {
    return { error: "patch payload missing required field 'member' (string)" };
  }
  if (typeof obj.rationale !== "string" || obj.rationale.length === 0) {
    return { error: "patch payload missing required field 'rationale' (string)" };
  }

  return {
    patch: {
      filePath,
      className: obj.className,
      member: obj.member,
      rationale: obj.rationale,
    },
  };
}

/**
 * Validate a parsed patch against the framework. This runs BEFORE the
 * patch is applied — if any check fails, the patch is rejected and the
 * framework is untouched.
 *
 * Checks:
 *   - target file exists inside the repo
 *   - target file has exactly one exported class with the given name
 *   - patch member parses as valid TypeScript when inserted into the class
 *   - patch member doesn't conflict with an existing member of the same name
 *   - patch member contains no `expect(` calls (assertions stay at test level)
 *   - patch member is a Locator getter OR a method body of ≤5 statements
 */
export function validatePatch(
  patch: PomPatch,
  repoRoot: string
): PatchValidationResult {
  const absPath = path.join(repoRoot, patch.filePath);

  // Path safety: reject any patch that points outside the repo, e.g. via "../"
  const resolvedRepo = path.resolve(repoRoot);
  const resolvedTarget = path.resolve(absPath);
  if (!resolvedTarget.startsWith(resolvedRepo + path.sep) && resolvedTarget !== resolvedRepo) {
    return { ok: false, error: `patch path "${patch.filePath}" resolves outside the repo root` };
  }

  let originalSource: string;
  try {
    originalSource = readFileSync(absPath, "utf8");
  } catch {
    return { ok: false, error: `target file does not exist: ${patch.filePath}` };
  }

  // Quick smell: assertions inside POM patches are forbidden.
  if (/\bexpect\s*\(/.test(patch.member)) {
    return {
      ok: false,
      error: "patch member contains an `expect(...)` call — assertions must live at the test level, not in POM methods",
    };
  }

  // Build a temporary in-memory file containing the original + the patch
  // and ask ts-morph to parse it. This is the single most reliable way to
  // catch malformed members.
  const project = new Project({
    useInMemoryFileSystem: true,
    compilerOptions: { target: 99, module: 99 }, // ESNext, ESNext
  });
  const sf = project.createSourceFile("__patch_check__.ts", originalSource);

  const targetClass = findExportedClass(sf, patch.className);
  if (!targetClass) {
    return {
      ok: false,
      error: `target class "${patch.className}" not found as an exported class in ${patch.filePath}`,
    };
  }

  // Try inserting the member at the end of the class body.
  let testInsert: ClassDeclaration;
  try {
    testInsert = targetClass;
    testInsert.addMember(patch.member);
  } catch (err) {
    return {
      ok: false,
      error: `patch member did not parse as a valid class member: ${(err as Error).message}`,
    };
  }

  // Now re-extract the inserted member to inspect it.
  const insertedMembers = testInsert.getMembers();
  const newMember = insertedMembers[insertedMembers.length - 1];
  if (!newMember) {
    return { ok: false, error: "ts-morph reported success but no member was added (internal error)" };
  }

  // Conflict check: a member with this name shouldn't already exist.
  const newName = getMemberName(newMember);
  if (!newName) {
    return {
      ok: false,
      error: "patch member has no extractable name (anonymous declarations are rejected)",
    };
  }
  const existingWithSameName = targetClass
    .getMembers()
    .filter((m) => m !== newMember && getMemberName(m) === newName);
  if (existingWithSameName.length > 0) {
    return {
      ok: false,
      error: `class "${patch.className}" already has a member named "${newName}" — patches cannot modify existing members, only add new ones`,
    };
  }

  // Length check: short, focused additions only. Reject runaway patches.
  const stmtCount = countStatementsInMember(newMember);
  if (stmtCount > 5) {
    return {
      ok: false,
      error: `patch member has ${stmtCount} statements — patches must be ≤5 statements (Locator getter or short action method)`,
    };
  }

  return { ok: true };
}

/**
 * Apply a validated patch by writing the modified file content to disk.
 * Returns a PatchedFile record so the caller can roll back later.
 */
export function applyPatch(patch: PomPatch, repoRoot: string): PatchedFile {
  const absPath = path.join(repoRoot, patch.filePath);
  const originalContent = readFileSync(absPath, "utf8");

  // Re-parse fresh to avoid sharing state with the validator's project.
  const project = new Project({
    useInMemoryFileSystem: true,
    compilerOptions: { target: 99, module: 99 },
  });
  const sf = project.createSourceFile("__apply__.ts", originalContent);
  const targetClass = findExportedClass(sf, patch.className);
  if (!targetClass) {
    // Should be impossible if validation passed, but stay defensive.
    throw new Error(`applyPatch: class "${patch.className}" not found in ${patch.filePath}`);
  }
  targetClass.addMember(patch.member);

  writeFileSync(absPath, sf.getFullText());
  return { filePath: absPath, originalContent };
}

/**
 * Roll back patches by writing the original content back to each file.
 * Used when compile validation fails after a patch was applied.
 */
export function rollbackPatches(patched: PatchedFile[]): void {
  for (const p of patched) {
    try {
      writeFileSync(p.filePath, p.originalContent);
    } catch {
      // If rollback itself fails the user has a dirty working tree, but
      // there's nothing the harness can do at this point. The caller
      // logs a warning.
    }
  }
}

// ─── helpers ──────────────────────────────────────────────────────────

function findExportedClass(sf: import("ts-morph").SourceFile, name: string): ClassDeclaration | undefined {
  for (const cls of sf.getClasses()) {
    if (!cls.isExported()) continue;
    if (cls.getName() === name) return cls;
  }
  return undefined;
}

function getMemberName(m: import("ts-morph").ClassMemberTypes): string | undefined {
  // Handle the cases that can appear in a Locator getter or short method.
  switch (m.getKind()) {
    case SyntaxKind.MethodDeclaration:
    case SyntaxKind.GetAccessor:
    case SyntaxKind.SetAccessor:
    case SyntaxKind.PropertyDeclaration:
      return (m as { getName: () => string }).getName();
    default:
      return undefined;
  }
}

function countStatementsInMember(m: import("ts-morph").ClassMemberTypes): number {
  // For getters and methods, count the statements in their body.
  // For property declarations (e.g. `foo = page.getByTestId(...)`), count as 1.
  switch (m.getKind()) {
    case SyntaxKind.MethodDeclaration:
    case SyntaxKind.GetAccessor: {
      const fn = m as import("ts-morph").MethodDeclaration | import("ts-morph").GetAccessorDeclaration;
      const body = fn.getBody();
      if (!body) return 0;
      const block = body.asKind(SyntaxKind.Block);
      return block ? block.getStatements().length : 1;
    }
    case SyntaxKind.PropertyDeclaration:
      return 1;
    default:
      return 0;
  }
}
