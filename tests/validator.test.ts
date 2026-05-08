import { describe, it, expect } from "vitest";
import { validateGeneratedTest } from "../src/validators/static.js";

describe("validateGeneratedTest", () => {
  it("flags raw CSS selectors", () => {
    const code = `
      import { test } from '../fixtures/checkout.fixture';
      test.describe('checkout', () => {
        test('foo @web @checkout @smoke', async ({ page }) => {
          await page.locator('.checkout-btn').click();
        });
      });
    `;
    const result = validateGeneratedTest(code);
    expect(result.ok).toBe(false);
    expect(result.errors.find((e) => e.rule === "no-raw-locator")).toBeTruthy();
  });

  it("flags bare-tag locators like locator('article')", () => {
    const code = `
      import { test } from '../fixtures/checkout.fixture';
      test.describe('checkout', () => {
        test('foo @web @checkout @smoke', async ({ catalogPage }) => {
          const card = await catalogPage.grid.locator('article').first();
          await card.click();
        });
      });
    `;
    const result = validateGeneratedTest(code);
    expect(result.ok).toBe(false);
    expect(result.errors.find((e) => e.rule === "no-raw-locator")).toBeTruthy();
  });

  it("allows locator() with [data-testid=...] attribute selector", () => {
    const code = `
      import { test, expect } from '../fixtures/checkout.fixture';
      test.describe('checkout', () => {
        test('foo @web @checkout @smoke', async ({ page }) => {
          const all = page.locator('[data-testid="product-card"]');
          await expect(all).toHaveCount(3);
        });
      });
    `;
    const result = validateGeneratedTest(code);
    expect(result.errors.filter((e) => e.severity === "error" && e.rule === "no-raw-locator")).toHaveLength(0);
  });

  it("flags hard waits", () => {
    const code = `
      import { test } from '../fixtures/checkout.fixture';
      test.describe('checkout', () => {
        test('foo @web @checkout @smoke', async ({ page }) => {
          await page.waitForTimeout(2000);
        });
      });
    `;
    const result = validateGeneratedTest(code);
    expect(result.ok).toBe(false);
    expect(result.errors.find((e) => e.rule === "no-hard-waits")).toBeTruthy();
  });

  it("flags importing test from @playwright/test", () => {
    const code = `
      import { test, expect } from '@playwright/test';
      test.describe('checkout', () => {
        test('foo @web @checkout @smoke', async ({ checkoutPage }) => {
          await expect(checkoutPage.orderConfirmation).toBeVisible();
        });
      });
    `;
    const result = validateGeneratedTest(code);
    expect(result.ok).toBe(false);
    expect(result.errors.find((e) => e.rule === "fixture-import")).toBeTruthy();
  });

  it("passes a clean test", () => {
    const code = `
      import { test, expect } from '../../fixtures/checkout.fixture';
      test.describe('Guest checkout', () => {
        test('completes order with Klarna @web @checkout @smoke', async ({ checkoutPage }) => {
          await checkoutPage.selectKlarna();
          await checkoutPage.placeOrderButton.click();
          await expect(checkoutPage.orderConfirmation).toBeVisible();
        });
      });
    `;
    const result = validateGeneratedTest(code);
    expect(result.ok).toBe(true);
    expect(result.errors.filter((e) => e.severity === "error")).toHaveLength(0);
  });

  it("warns on missing @web tag", () => {
    const code = `
      import { test, expect } from '../../fixtures/checkout.fixture';
      test.describe('checkout', () => {
        test('does the thing', async ({ checkoutPage }) => {
          await checkoutPage.placeOrderButton.click();
        });
      });
    `;
    const result = validateGeneratedTest(code);
    expect(result.errors.find((e) => e.rule === "missing-tags")).toBeTruthy();
    expect(result.errors.find((e) => e.rule === "missing-tags")?.severity).toBe("warn");
  });

  it("flags POM expect/verify/assert methods at the call site", () => {
    const code = `
      import { test, expect } from '../../fixtures/checkout.fixture';
      test.describe('checkout', () => {
        test('foo @web @checkout @priority-high', async ({ orderConfirmationPage }) => {
          await orderConfirmationPage.expectVisaPayment();
        });
      });
    `;
    const result = validateGeneratedTest(code);
    expect(result.errors.find((e) => e.rule === "assertions-at-test-level")).toBeTruthy();
    // It's a warning, not a hard error — the file still passes.
    expect(result.ok).toBe(true);
  });

  it("does not flag plain expect() assertions", () => {
    const code = `
      import { test, expect } from '../../fixtures/checkout.fixture';
      test.describe('checkout', () => {
        test('foo @web @checkout @priority-high', async ({ orderConfirmationPage }) => {
          await expect(orderConfirmationPage.paymentMethod).toContainText('Visa');
        });
      });
    `;
    const result = validateGeneratedTest(code);
    expect(result.errors.find((e) => e.rule === "assertions-at-test-level")).toBeFalsy();
  });
});
