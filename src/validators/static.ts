// Static validators.
//
// These are the "hard gates" — they catch convention violations the model
// might commit despite the system prompt. Each returns a list of errors;
// an empty list means the file passes that gate.
//
// Phase 0 keeps these as text-pattern checks. Phase 1 should add a proper
// ts-morph based AST walker for more accurate detection.

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
  const lines = content.split("\n");

  // Rule 1: No raw page.locator() with CSS or XPath selectors.
  // Allow page.locator() that wraps a chain like .filter() but flag string-arg cases.
  lines.forEach((line, i) => {
    const m = line.match(/page\.locator\(\s*['"`]([^'"`]+)['"`]/);
    if (m) {
      const selector = m[1];
      const isXpath = selector.startsWith("//") || selector.startsWith("xpath=");
      const isCss =
        selector.includes("css=") ||
        /^[#.\[]/.test(selector) ||
        /^[a-z]+(\s|$|>|\.|\[|#)/.test(selector);
      if (isXpath || isCss) {
        errors.push({
          rule: "no-raw-locator",
          message: `Forbidden raw selector "${selector}" — use getByTestId/getByRole/getByLabel instead`,
          line: i + 1,
          severity: "error",
        });
      }
    }
  });

  // Rule 2: No hard waits.
  lines.forEach((line, i) => {
    if (/page\.waitForTimeout\s*\(/.test(line)) {
      errors.push({
        rule: "no-hard-waits",
        message: "page.waitForTimeout() is forbidden — use waitFor or auto-waiting assertions",
        line: i + 1,
        severity: "error",
      });
    }
  });

  // Rule 3: Must import test from a fixture, not from @playwright/test.
  const importsTestFromPlaywright = /import\s*\{[^}]*\btest\b[^}]*\}\s*from\s*['"]@playwright\/test['"]/.test(
    content
  );
  if (importsTestFromPlaywright) {
    errors.push({
      rule: "fixture-import",
      message:
        "Import `test` from a fixture file (e.g. '../../fixtures/checkout.fixture'), not from '@playwright/test'",
      severity: "error",
    });
  }

  // Rule 4: Every test() block should have framework tags.
  const testBlocks = content.match(/test\(\s*['"`][^'"`]+['"`]/g) ?? [];
  for (const block of testBlocks) {
    const hasWebTag = block.includes("@web");
    if (!hasWebTag) {
      errors.push({
        rule: "missing-tags",
        message: `Test "${block.slice(0, 50)}..." is missing required tags (@web @<domain> @<priority>)`,
        severity: "warn",
      });
    }
  }

  // Rule 5: File should contain at least one test.describe block.
  if (!content.includes("test.describe(")) {
    errors.push({
      rule: "missing-describe",
      message: "Spec file must contain a `test.describe(...)` block",
      severity: "warn",
    });
  }

  const hardErrors = errors.filter((e) => e.severity === "error");
  return {
    ok: hardErrors.length === 0,
    errors,
  };
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
