// Static validators.
//
// These are the "hard gates" — they catch convention violations the model
// might commit despite the system prompt. Each returns a list of errors;
// an empty list means the file passes that gate.
//
// Upgraded to use ts-morph for accurate AST-based detection.

import { Project, SyntaxKind, type SourceFile } from "ts-morph";

export interface ValidationError {
  rule: string;
  message: string;
  line?: number;
  severity: "error" | "warn";
}

export interface ValidationResult {
  ok: boolean;
  errors: ValidationError[];
}

export function validateGeneratedTest(content: string): ValidationResult {
  const errors: ValidationError[] = [];
  
  const project = new Project({ useInMemoryFileSystem: true });
  const sourceFile = project.createSourceFile("generated.spec.ts", content);

  validateLocators(sourceFile, errors);
  validateHardWaits(sourceFile, errors);
  validateImports(sourceFile, errors);
  validateTags(sourceFile, errors);
  validateDescribe(sourceFile, errors);
  validateAssertionsAtTestLevel(sourceFile, errors);

  const hardErrors = errors.filter((e) => e.severity === "error");
  return {
    ok: hardErrors.length === 0,
    errors,
  };
}

/**
 * Rule 1: No raw page.locator() with CSS or XPath selectors.
 */
function validateLocators(sourceFile: SourceFile, errors: ValidationError[]) {
  sourceFile.forEachDescendant(node => {
    if (node.getKind() === SyntaxKind.CallExpression) {
      const call = node.asKindOrThrow(SyntaxKind.CallExpression);
      const access = call.getExpression();
      const text = access.getText();
      
      if (text.endsWith(".locator")) {
        const args = call.getArguments();
        if (args.length > 0) {
          const firstArg = args[0];
          const selector = firstArg.getText().replace(/['"`]/g, "");
          
          // Allow only [data-testid=...] selectors inside locator()
          const isAllowed = /^\[data-testid[=~|^$*]?=/.test(selector);
          if (!isAllowed) {
            errors.push({
              rule: "no-raw-locator",
              message: `Forbidden raw selector "${selector}" — use getByTestId/getByRole/getByLabel instead`,
              line: node.getStartLineNumber(),
              severity: "error",
            });
          }
        }
      }
    }
  });
}

/**
 * Rule 2: No hard waits.
 */
function validateHardWaits(sourceFile: SourceFile, errors: ValidationError[]) {
  sourceFile.forEachDescendant(node => {
    if (node.getKind() === SyntaxKind.CallExpression) {
      const call = node.asKindOrThrow(SyntaxKind.CallExpression);
      const text = call.getExpression().getText();
      
      if (text.endsWith(".waitForTimeout")) {
        errors.push({
          rule: "no-hard-waits",
          message: "page.waitForTimeout() is forbidden — use waitFor or auto-waiting assertions",
          line: node.getStartLineNumber(),
          severity: "error",
        });
      }
    }
  });
}

/**
 * Rule 3: Must import test from a fixture, not from @playwright/test.
 */
function validateImports(sourceFile: SourceFile, errors: ValidationError[]) {
  const imports = sourceFile.getImportDeclarations();
  for (const imp of imports) {
    const moduleSpecifier = imp.getModuleSpecifierValue();
    if (moduleSpecifier === "@playwright/test") {
      const namedImports = imp.getNamedImports().map(ni => ni.getName());
      if (namedImports.includes("test")) {
        errors.push({
          rule: "fixture-import",
          message: "Import `test` from a fixture file, not from '@playwright/test'",
          line: imp.getStartLineNumber(),
          severity: "error",
        });
      }
    }
  }
}

/**
 * Rule 4: Every test() block should have framework tags.
 */
function validateTags(sourceFile: SourceFile, errors: ValidationError[]) {
  sourceFile.forEachDescendant(node => {
    if (node.getKind() === SyntaxKind.CallExpression) {
      const call = node.asKindOrThrow(SyntaxKind.CallExpression);
      const text = call.getExpression().getText();
      
      if (text === "test" || text === "test.only") {
        const args = call.getArguments();
        if (args.length > 0) {
          const firstArg = args[0];
          const testName = firstArg.getText().replace(/['"`]/g, "");
          if (!testName.includes("@web")) {
            errors.push({
              rule: "missing-tags",
              message: `Test "${testName.slice(0, 40)}..." is missing required tags (@web @<domain> @<priority>)`,
              line: node.getStartLineNumber(),
              severity: "warn",
            });
          }
        }
      }
    }
  });
}

/**
 * Rule 5: File should contain at least one test.describe block.
 */
function validateDescribe(sourceFile: SourceFile, errors: ValidationError[]) {
  let hasDescribe = false;
  sourceFile.forEachDescendant(node => {
    if (node.getKind() === SyntaxKind.CallExpression) {
      const text = node.asKindOrThrow(SyntaxKind.CallExpression).getExpression().getText();
      if (text === "test.describe" || text === "test.describe.only") {
        hasDescribe = true;
      }
    }
  });

  if (!hasDescribe) {
    errors.push({
      rule: "missing-describe",
      message: "Spec file must contain a `test.describe(...)` block",
      severity: "warn",
    });
  }
}

/**
 * Rule 6: Assertions live at the test level, never inside POM methods.
 *
 * Flag method calls like `pomName.expectFoo(...)`, `pomName.verifyBar(...)`,
 * `pomName.assertBaz(...)` — these are usually misplaced assertions that
 * belong in the test as `await expect(pomName.fooLocator).toBe...`.
 *
 * Severity is `warn` not `error` because legitimate semantic helpers like
 * `expectLoaded()` or `waitForReady()` exist; we surface the smell without
 * blocking the build. The model still sees this in retry feedback when
 * other errors fire.
 *
 * Implementation note: the regex-based approach used to false-positive on
 * `expect(...)` itself. Using the AST and excluding the literal `expect`
 * identifier handles that cleanly.
 */
function validateAssertionsAtTestLevel(sourceFile: SourceFile, errors: ValidationError[]) {
  sourceFile.forEachDescendant(node => {
    if (node.getKind() !== SyntaxKind.CallExpression) return;
    const call = node.asKindOrThrow(SyntaxKind.CallExpression);
    const expr = call.getExpression();
    // We're looking for property-access style: `something.expectXxx(`.
    if (expr.getKind() !== SyntaxKind.PropertyAccessExpression) return;

    const propAccess = expr.asKindOrThrow(SyntaxKind.PropertyAccessExpression);
    const target = propAccess.getExpression().getText();
    const methodName = propAccess.getName();

    // Skip the literal `expect(...)` chain — `expect(foo).toBe...` is fine.
    if (target === "expect") return;

    // Match expectFoo / verifyFoo / assertFoo with an uppercase first
    // letter after the verb (so it's clearly a compound name).
    if (!/^(expect|verify|assert)[A-Z]/.test(methodName)) return;

    errors.push({
      rule: "assertions-at-test-level",
      message: `"${target}.${methodName}(...)" looks like an assertion buried in a POM method. Move it to the test using \`await expect(${target}.someLocator).toBe...()\` instead.`,
      line: node.getStartLineNumber(),
      severity: "warn",
    });
  });
}

export function formatErrorsForRetry(result: ValidationResult): string {
  const lines: string[] = [];
  for (const err of result.errors) {
    const prefix = err.severity === "error" ? "ERROR" : "WARN";
    const loc = err.line ? ` (line ${err.line})` : "";
    lines.push(`${prefix} [${err.rule}]${loc}: ${err.message}`);
  }
  return lines.join("\n");
}
