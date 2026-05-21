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

  // ──────────────────────────────────────────────────────────────────────
  // Additional rule: missing PROMO_CODES import
  // ──────────────────────────────────────────────────────────────────────
  if (content.includes('PROMO_CODES.') && !content.includes('import { PROMO_CODES }') && !content.includes('import { PROMO_CODES,')) {
    errors.push({
      rule: "missing-promo-codes-import",
      message: "You used PROMO_CODES but did not import it. Add: import { PROMO_CODES } from '../../test-data/factories';",
      severity: "error",
      line: findLineNumber(content, 'PROMO_CODES.'),
    });
  }

  // ──────────────────────────────────────────────────────────────────────
  // Additional rule: prevent calling getter‑like methods that should be
  // property accesses (e.g., `.getTotalsSubtotal()` vs `.totalsSubtotal`)
  // ──────────────────────────────────────────────────────────────────────
  const getterMethodCallRegex = /(\w+)\.(get[A-Z]\w+)\s*\(/g;
  let getterMatch;
  while ((getterMatch = getterMethodCallRegex.exec(content)) !== null) {
    const instanceName = getterMatch[1];
    const methodName = getterMatch[2];
    const knownPoms = ['productPage', 'cartDrawer', 'checkoutPage', 'orderConfirmationPage', 'homePage', 'catalogPage'];
    if (knownPoms.includes(instanceName)) {
      const propertyName = methodName[3].toLowerCase() + methodName.slice(4);
      errors.push({
        rule: "locator-as-method",
        message: `Called "${instanceName}.${methodName}()" but "${instanceName}.${propertyName}" is likely a property (locator). Use "${instanceName}.${propertyName}" directly (e.g., await ${instanceName}.${propertyName}.textContent()).`,
        severity: "error",
        line: findLineNumber(content, `${instanceName}.${methodName}(`),
      });
    }
  }

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
 */
function validateAssertionsAtTestLevel(sourceFile: SourceFile, errors: ValidationError[]) {
  sourceFile.forEachDescendant(node => {
    if (node.getKind() !== SyntaxKind.CallExpression) return;
    const call = node.asKindOrThrow(SyntaxKind.CallExpression);
    const expr = call.getExpression();
    if (expr.getKind() !== SyntaxKind.PropertyAccessExpression) return;

    const propAccess = expr.asKindOrThrow(SyntaxKind.PropertyAccessExpression);
    const target = propAccess.getExpression().getText();
    const methodName = propAccess.getName();

    if (target === "expect") return;

    if (/^(expect|verify|assert)[A-Z]/.test(methodName)) {
      errors.push({
        rule: "assertions-at-test-level",
        message: `"${target}.${methodName}(...)" looks like an assertion buried in a POM method. Move it to the test using \`await expect(${target}.someLocator).toBe...()\` instead.`,
        line: node.getStartLineNumber(),
        severity: "warn",
      });
    }
  });
}

/**
 * Helper to find the approximate line number of a substring in the content.
 */
function findLineNumber(content: string, substr: string): number | undefined {
  const lines = content.split('\n');
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes(substr)) return i + 1;
  }
  return undefined;
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