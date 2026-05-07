// The catalogue extractor.
//
// This is the heart of context engineering for the platform. It walks the
// framework repo with ts-morph and extracts structured metadata about:
//   - Page Object Model (POM) classes and their public locators/methods
//   - Test fixtures and what they inject
//   - Utility functions and their signatures
//
// The output is a JSON catalogue that the context builder consumes at
// generation time. This is what makes the model produce framework-aligned
// code instead of inventing its own conventions.

import { Project, ClassDeclaration, SourceFile, SyntaxKind } from "ts-morph";
import { Catalogue, PomEntry, FixtureEntry, UtilEntry, LocatorEntry, MethodSignature } from "../types.js";
import path from "node:path";

export interface ExtractorOptions {
  rootPath: string; // path to the framework repo root
  pomGlob?: string; // glob for POM files
  fixtureGlob?: string; // glob for fixture files
  utilGlob?: string; // glob for util files
  tsConfigPath?: string;
}

const DEFAULTS: Required<Omit<ExtractorOptions, "rootPath" | "tsConfigPath">> = {
  pomGlob: "**/pages/**/*.page.ts",
  fixtureGlob: "**/fixtures/**/*.fixture.ts",
  utilGlob: "**/utils/**/*.ts",
};

export async function extractCatalogue(opts: ExtractorOptions): Promise<Catalogue> {
  const { rootPath } = opts;
  const pomGlob = opts.pomGlob ?? DEFAULTS.pomGlob;
  const fixtureGlob = opts.fixtureGlob ?? DEFAULTS.fixtureGlob;
  const utilGlob = opts.utilGlob ?? DEFAULTS.utilGlob;

  const project = new Project({
    tsConfigFilePath: opts.tsConfigPath ?? path.join(rootPath, "tsconfig.json"),
    skipAddingFilesFromTsConfig: true,
  });

  // Add the file globs we care about. ts-morph resolves them relative to cwd,
  // so we anchor with the rootPath.
  project.addSourceFilesAtPaths([
    path.join(rootPath, pomGlob),
    path.join(rootPath, fixtureGlob),
    path.join(rootPath, utilGlob),
  ]);

  const poms: PomEntry[] = [];
  const fixtures: FixtureEntry[] = [];
  const utils: UtilEntry[] = [];

  // The rootPath itself may sit inside a domain folder
  // (e.g. examples/checkout/pages/cart.page.ts when rootPath=examples/checkout).
  // We pass the rootPath's last segment as a hint so domain inference can use it
  // when nothing in the relative path matches.
  const rootHint = path.basename(rootPath);

  for (const sourceFile of project.getSourceFiles()) {
    const filePath = path.relative(rootPath, sourceFile.getFilePath());
    const domain = inferDomain(filePath, rootHint);

    if (filePath.includes(`${path.sep}pages${path.sep}`) || filePath.startsWith(`pages${path.sep}`) || filePath.endsWith(".page.ts")) {
      poms.push(...extractPoms(sourceFile, filePath, domain));
    } else if (filePath.includes(`${path.sep}fixtures${path.sep}`) || filePath.startsWith(`fixtures${path.sep}`) || filePath.endsWith(".fixture.ts")) {
      fixtures.push(...extractFixtures(sourceFile, filePath, domain));
    } else if (filePath.includes(`${path.sep}utils${path.sep}`) || filePath.startsWith(`utils${path.sep}`)) {
      utils.push(...extractUtils(sourceFile, filePath, domain));
    }
  }

  return {
    poms,
    fixtures,
    utils,
    generatedAt: new Date().toISOString(),
    rootPath,
  };
}

// Domain inference: tests/checkout/cart.page.ts -> "checkout"
// This is heuristic — your team may want to override with explicit tags.
// `rootHint` is the last segment of the rootPath, used as a fallback when
// the relative path itself doesn't contain a recognisable domain folder.
function inferDomain(relPath: string, rootHint: string): string {
  const known = ["checkout", "cart", "pdp", "plp", "account", "search", "club", "wishlist"];
  const parts = relPath.split(path.sep);

  // First: look for a known domain folder in the relative path.
  for (const part of parts) {
    if (known.includes(part)) return part;
  }

  // Second: check if the rootPath's last segment is itself a known domain.
  if (known.includes(rootHint)) return rootHint;

  // Fallback: first folder that isn't generic.
  const generic = new Set(["src", "tests", "test", "pages", "fixtures", "utils", "lib"]);
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

    const publicLocators = extractLocators(cls);
    const publicMethods = extractMethods(cls);

    results.push({
      className,
      filePath,
      domain,
      publicLocators,
      publicMethods,
    });
  }

  return results;
}

function extractLocators(cls: ClassDeclaration): LocatorEntry[] {
  const out: LocatorEntry[] = [];

  // Properties (eager): public foo = page.getByRole(...)
  for (const prop of cls.getProperties()) {
    if (prop.hasModifier(SyntaxKind.PrivateKeyword)) continue;
    if (prop.hasModifier(SyntaxKind.ProtectedKeyword)) continue;
    const typeText = prop.getType().getText();
    if (typeText.includes("Locator")) {
      out.push({ name: prop.getName(), type: typeText });
    }
  }

  // Getters (lazy proxy POM pattern): get checkoutButton(): Locator { ... }
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
    const isAsync = method.isAsync();
    out.push({ name, params, returnType, isAsync });
  }
  return out;
}

function extractFixtures(sourceFile: SourceFile, filePath: string, domain: string): FixtureEntry[] {
  // Playwright fixtures are typically: export const test = base.extend<{ ... }>({ ... })
  // Strategy: try the type checker first (most accurate, follows aliases),
  // fall back to AST literal/reference walking when types can't be resolved
  // (e.g. @playwright/test not installed, or partial repos).
  const results: FixtureEntry[] = [];

  for (const decl of sourceFile.getVariableDeclarations()) {
    if (!decl.isExported()) continue;
    const initializer = decl.getInitializer();
    if (!initializer) continue;
    const text = initializer.getText();
    if (!text.includes("extend")) continue;

    const injects = resolveFixtureInjects(decl, sourceFile, initializer);

    results.push({
      name: decl.getName(),
      filePath,
      domain,
      injects,
    });
  }

  return results;
}

function resolveFixtureInjects(
  decl: import("ts-morph").VariableDeclaration,
  sourceFile: SourceFile,
  initializer: import("ts-morph").Expression
): string[] {
  // Strategy 1: type checker resolution.
  const declType = decl.getType();
  const typeProps = declType.getProperties();
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

  // Strategy 3: type reference resolution — handles `.extend<MyFixtures>(...)`
  // where MyFixtures is a type alias defined in the same file.
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
    if (iface) {
      return iface.getProperties().map((p) => p.getName());
    }
  }

  return [];
}

// Names that come from base Playwright fixtures, not user-defined ones.
// We exclude these so the catalogue shows only what the team has injected.
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
