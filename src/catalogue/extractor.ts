// The catalogue extractor.
//
// Walks the framework repo with ts-morph and extracts structured metadata:
//   - Page Object Model (POM) classes — public locators + methods
//   - Test fixtures — what they inject into tests
//   - Utility functions — exported helpers
//   - Enum-like types — string union literals (e.g. ProductCategory)
//   - Named constants — exported const catalogues (e.g. VARIANTS)
//   - Existing tests — used as few-shot examples for the model
//
// The output JSON is consumed by the context builder at generation time.
// This is what makes the model produce framework-aligned code instead of
// inventing its own conventions.

import { Project, ClassDeclaration, SourceFile, SyntaxKind } from "ts-morph";
import {
  Catalogue,
  PomEntry,
  FixtureEntry,
  UtilEntry,
  LocatorEntry,
  MethodSignature,
  EnumLikeType,
  NamedConstant,
  SimilarTest,
} from "../types.js";
import path from "node:path";
import { readFileSync } from "node:fs";

export interface ExtractorOptions {
  rootPath: string;
  pomGlob?: string;
  fixtureGlob?: string;
  utilGlob?: string;
  /** Glob for files containing type aliases / exported constants. */
  typeGlob?: string;
  /** Glob for existing tests to use as few-shot examples. */
  testGlob?: string;
  tsConfigPath?: string;
}

const DEFAULTS: Required<Omit<ExtractorOptions, "rootPath" | "tsConfigPath">> = {
  pomGlob: "**/pages/**/*.page.ts",
  fixtureGlob: "**/fixtures/**/*.fixture.ts",
  utilGlob: "**/utils/**/*.ts",
  typeGlob: "**/{types,test-data}/**/*.ts",
  testGlob: "**/tests/**/*.spec.ts",
};

export async function extractCatalogue(opts: ExtractorOptions): Promise<Catalogue> {
  const { rootPath } = opts;
  const pomGlob = opts.pomGlob ?? DEFAULTS.pomGlob;
  const fixtureGlob = opts.fixtureGlob ?? DEFAULTS.fixtureGlob;
  const utilGlob = opts.utilGlob ?? DEFAULTS.utilGlob;
  const typeGlob = opts.typeGlob ?? DEFAULTS.typeGlob;
  const testGlob = opts.testGlob ?? DEFAULTS.testGlob;

  const project = new Project({
    tsConfigFilePath: opts.tsConfigPath ?? path.join(rootPath, "tsconfig.json"),
    skipAddingFilesFromTsConfig: true,
  });

  project.addSourceFilesAtPaths([
    path.join(rootPath, pomGlob),
    path.join(rootPath, fixtureGlob),
    path.join(rootPath, utilGlob),
    path.join(rootPath, typeGlob),
    path.join(rootPath, testGlob),
  ]);

  const poms: PomEntry[] = [];
  const fixtures: FixtureEntry[] = [];
  const utils: UtilEntry[] = [];
  const enumLikeTypes: EnumLikeType[] = [];
  const namedConstants: NamedConstant[] = [];
  const existingTests: SimilarTest[] = [];

  const rootHint = path.basename(rootPath);

  for (const sourceFile of project.getSourceFiles()) {
    const filePath = path.relative(rootPath, sourceFile.getFilePath());
    const domain = inferDomain(filePath, rootHint);
    const isPom = filePath.endsWith(".page.ts")
      || filePath.includes(`${path.sep}pages${path.sep}`)
      || filePath.startsWith(`pages${path.sep}`);
    const isFixture = filePath.endsWith(".fixture.ts")
      || filePath.includes(`${path.sep}fixtures${path.sep}`)
      || filePath.startsWith(`fixtures${path.sep}`);
    const isUtil = filePath.includes(`${path.sep}utils${path.sep}`)
      || filePath.startsWith(`utils${path.sep}`);
    const isTypeOrData = filePath.includes(`${path.sep}types${path.sep}`)
      || filePath.startsWith(`types${path.sep}`)
      || filePath.includes(`${path.sep}test-data${path.sep}`)
      || filePath.startsWith(`test-data${path.sep}`);
    const isTest = filePath.endsWith(".spec.ts") || filePath.endsWith(".test.ts");

    if (isTest) {
      existingTests.push(...extractExistingTests(sourceFile, filePath, domain));
      continue;
    }

    if (isPom) {
      poms.push(...extractPoms(sourceFile, filePath, domain));
    } else if (isFixture) {
      fixtures.push(...extractFixtures(sourceFile, filePath, domain));
    } else if (isUtil) {
      utils.push(...extractUtils(sourceFile, filePath, domain));
    }

    // Enums and named constants can live in types/, test-data/, or utils/.
    if (isTypeOrData || isUtil) {
      enumLikeTypes.push(...extractEnumLikeTypes(sourceFile, filePath));
      namedConstants.push(...extractNamedConstants(sourceFile, filePath));
    }
  }

  return {
    poms,
    fixtures,
    utils,
    enumLikeTypes,
    namedConstants,
    existingTests,
    generatedAt: new Date().toISOString(),
    rootPath,
  };
}

// ─── Helpers ─────────────────────────────────────────────────────────────

function inferDomain(relPath: string, rootHint: string): string {
  const known = ["checkout", "cart", "pdp", "plp", "account", "search", "club", "wishlist"];
  const parts = relPath.split(path.sep);
  for (const part of parts) {
    if (known.includes(part)) return part;
  }
  if (known.includes(rootHint)) return rootHint;
  const generic = new Set(["src", "tests", "test", "pages", "fixtures", "utils", "lib", "types", "test-data"]);
  for (const part of parts) {
    if (!generic.has(part) && !part.endsWith(".ts")) return part;
  }
  return "common";
}

function extractPoms(sourceFile: SourceFile, filePath: string, domain: string): PomEntry[] {
  const results: PomEntry[] = [];
  for (const cls of sourceFile.getClasses()) {
    if (!cls.isExported()) continue;
    const className = cls.getName();
    if (!className) continue;
    results.push({
      className,
      filePath,
      domain,
      publicLocators: extractLocators(cls),
      publicMethods: extractMethods(cls),
    });
  }
  return results;
}

function extractLocators(cls: ClassDeclaration): LocatorEntry[] {
  const out: LocatorEntry[] = [];
  for (const prop of cls.getProperties()) {
    if (prop.hasModifier(SyntaxKind.PrivateKeyword)) continue;
    if (prop.hasModifier(SyntaxKind.ProtectedKeyword)) continue;
    const typeText = prop.getType().getText();
    if (typeText.includes("Locator")) {
      out.push({ name: prop.getName(), type: typeText });
    }
  }
  for (const getter of cls.getGetAccessors()) {
    if (getter.hasModifier(SyntaxKind.PrivateKeyword)) continue;
    if (getter.hasModifier(SyntaxKind.ProtectedKeyword)) continue;
    const returnType = getter.getReturnType().getText();
    if (returnType.includes("Locator")) {
      out.push({ name: getter.getName(), type: returnType });
    }
  }
  return out;
}

function extractMethods(cls: ClassDeclaration): MethodSignature[] {
  const out: MethodSignature[] = [];
  for (const method of cls.getMethods()) {
    if (method.hasModifier(SyntaxKind.PrivateKeyword)) continue;
    if (method.hasModifier(SyntaxKind.ProtectedKeyword)) continue;
    const name = method.getName();
    const params = method.getParameters().map((p) => `${p.getName()}: ${p.getType().getText()}`).join(", ");
    const returnType = method.getReturnType().getText();
    out.push({ name, params, returnType, isAsync: method.isAsync() });
  }
  return out;
}

function extractFixtures(sourceFile: SourceFile, filePath: string, domain: string): FixtureEntry[] {
  const results: FixtureEntry[] = [];
  for (const decl of sourceFile.getVariableDeclarations()) {
    if (!decl.isExported()) continue;
    const initializer = decl.getInitializer();
    if (!initializer) continue;
    const text = initializer.getText();
    if (!text.includes("extend")) continue;

    const injects = resolveFixtureInjects(decl, sourceFile, initializer);
    results.push({ name: decl.getName(), filePath, domain, injects });
  }
  return results;
}

function resolveFixtureInjects(
  decl: import("ts-morph").VariableDeclaration,
  sourceFile: SourceFile,
  initializer: import("ts-morph").Expression
): string[] {
  // Strategy 1: type checker — most accurate, follows aliases.
  const typeProps = decl.getType().getProperties();
  const fromTypeChecker: string[] = [];
  for (const prop of typeProps) {
    const name = prop.getName();
    if (BUILTIN_PLAYWRIGHT_FIXTURES.has(name)) continue;
    if (name.startsWith("_") || name.startsWith("$")) continue;
    fromTypeChecker.push(name);
  }
  if (fromTypeChecker.length > 0) return fromTypeChecker;

  // Strategy 2: inline TypeLiteral walk — handles `.extend<{ foo: Foo }>(...)`
  const literals = initializer.getDescendantsOfKind(SyntaxKind.TypeLiteral);
  for (const ta of literals) {
    const names: string[] = [];
    for (const member of ta.getMembers()) {
      if (member.getKind() === SyntaxKind.PropertySignature) {
        const ps = member.asKind(SyntaxKind.PropertySignature);
        if (ps) names.push(ps.getName());
      }
    }
    if (names.length > 0) return names;
  }

  // Strategy 3: type reference resolution — for `.extend<MyFixtures>(...)`.
  const refs = initializer.getDescendantsOfKind(SyntaxKind.TypeReference);
  for (const ref of refs) {
    const refName = ref.getTypeName().getText();
    const alias = sourceFile.getTypeAlias(refName);
    if (alias) {
      const aliasType = alias.getTypeNodeOrThrow();
      const literals = aliasType.getDescendantsOfKind(SyntaxKind.PropertySignature);
      const names = literals.map((p) => p.getName());
      if (names.length > 0) return names;
    }
    const iface = sourceFile.getInterface(refName);
    if (iface) return iface.getProperties().map((p) => p.getName());
  }
  return [];
}

const BUILTIN_PLAYWRIGHT_FIXTURES = new Set([
  "page", "context", "browser", "browserName", "request", "playwright",
  "extend", "describe", "beforeEach", "afterEach", "beforeAll", "afterAll",
  "skip", "only", "fixme", "fail", "slow", "setTimeout", "step", "info",
  "use", "configure", "expect",
]);

function extractUtils(sourceFile: SourceFile, filePath: string, domain: string): UtilEntry[] {
  const out: UtilEntry[] = [];
  for (const fn of sourceFile.getFunctions()) {
    if (!fn.isExported()) continue;
    const name = fn.getName();
    if (!name) continue;
    const params = fn.getParameters().map((p) => `${p.getName()}: ${p.getType().getText()}`).join(", ");
    const returnType = fn.getReturnType().getText();
    const signature = `${fn.isAsync() ? "async " : ""}function ${name}(${params}): ${returnType}`;
    out.push({ name, filePath, domain, signature });
  }
  return out;
}

/**
 * Extract type aliases whose RHS is a literal union, e.g.:
 *   export type ProductCategory = "outerwear" | "knitwear" | ...
 *
 * The model needs the actual valid values, not just the type name, or it
 * fabricates plausible-looking strings ("jackets") that don't exist.
 */
function extractEnumLikeTypes(sourceFile: SourceFile, filePath: string): EnumLikeType[] {
  const out: EnumLikeType[] = [];
  for (const alias of sourceFile.getTypeAliases()) {
    if (!alias.isExported()) continue;
    const aliasType = alias.getType();
    if (!aliasType.isUnion()) continue;

    const members: string[] = [];
    for (const m of aliasType.getUnionTypes()) {
      if (m.isStringLiteral()) {
        members.push(m.getLiteralValueOrThrow() as string);
      } else if (m.isNumberLiteral()) {
        members.push(String(m.getLiteralValueOrThrow()));
      }
    }
    // Only surface if EVERY member is a literal — partial unions mislead.
    if (members.length === aliasType.getUnionTypes().length && members.length > 0) {
      out.push({ name: alias.getName(), filePath, members });
    }
  }
  return out;
}

/**
 * Extract `export const FOO = { KEY1: ..., KEY2: ... } as const` exports.
 * These usually hold test data catalogues. The model should prefer
 * `VARIANTS.KNIT_MOSS_M` over inlining `{ productId: "p-002", ... }`.
 */
function extractNamedConstants(sourceFile: SourceFile, filePath: string): NamedConstant[] {
  const out: NamedConstant[] = [];
  for (const decl of sourceFile.getVariableDeclarations()) {
    if (!decl.isExported()) continue;
    const stmt = decl.getVariableStatementOrThrow();
    if (stmt.getDeclarationKind() !== "const") continue;

    const initializer = decl.getInitializer();
    if (!initializer) continue;

    let objLit = initializer.asKind(SyntaxKind.ObjectLiteralExpression);
    if (!objLit) {
      const asExpr = initializer.asKind(SyntaxKind.AsExpression);
      if (asExpr) {
        objLit = asExpr.getExpression().asKind(SyntaxKind.ObjectLiteralExpression);
      }
    }
    if (!objLit) continue;

    const name = decl.getName();
    if (name.startsWith("_")) continue;

    const keys: string[] = [];
    for (const prop of objLit.getProperties()) {
      const propAssign = prop.asKind(SyntaxKind.PropertyAssignment);
      if (propAssign) keys.push(propAssign.getName());
      const shorthand = prop.asKind(SyntaxKind.ShorthandPropertyAssignment);
      if (shorthand) keys.push(shorthand.getName());
    }
    if (keys.length < 2) continue;

    out.push({
      name,
      filePath,
      shape: `const ${name} = { ${keys.join(", ")} }`,
      keys,
    });
  }
  return out;
}

/**
 * Extract existing tests from `*.spec.ts` files. The model uses these
 * as few-shot examples — the single biggest unlock for output that
 * matches team conventions on test.step usage, tag style, factories, etc.
 */
function extractExistingTests(sourceFile: SourceFile, filePath: string, domain: string): SimilarTest[] {
  const out: SimilarTest[] = [];
  const fullText = readFileSync(sourceFile.getFilePath(), "utf8");
  const lines = fullText.split("\n");

  sourceFile.forEachDescendant((node) => {
    const callExpr = node.asKind(SyntaxKind.CallExpression);
    if (!callExpr) return;
    const calleeText = callExpr.getExpression().getText();
    if (calleeText !== "test" && !calleeText.startsWith("test.")) return;
    if (calleeText === "test.describe" || calleeText === "test.describe.only") return;

    const args = callExpr.getArguments();
    if (args.length < 2) return;
    const firstArg = args[0];
    const isStringLit = firstArg.asKind(SyntaxKind.StringLiteral)
      || firstArg.asKind(SyntaxKind.NoSubstitutionTemplateLiteral);
    if (!isStringLit) return;

    const testName = firstArg.getText().slice(1, -1);
    const tags = (testName.match(/@[\w-]+/g) || []) as string[];
    const startLine = callExpr.getStartLineNumber();
    const endLine = callExpr.getEndLineNumber();
    // Trim to ~30 lines so any single test can't dominate the prompt.
    const excerptLines = lines.slice(startLine - 1, Math.min(endLine, startLine - 1 + 30));
    const excerpt = excerptLines.join("\n");

    out.push({
      filePath,
      domain,
      testName,
      tags,
      excerpt,
      matchScore: 0, // filled in by context builder
    });
  });

  return out;
}
