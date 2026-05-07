import { defineConfig } from "vitest/config";

/**
 * Vitest config — only the prototype's own unit tests live in `tests/`.
 *
 * The `examples/` folder contains Playwright tests for sample frameworks.
 * Those are runnable via Playwright (`npx playwright test`), not vitest.
 * Excluding them prevents vitest from trying to import `@playwright/test`
 * which isn't a dependency of the prototype itself.
 */
export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    exclude: ["node_modules", "dist", "examples"],
  },
});
