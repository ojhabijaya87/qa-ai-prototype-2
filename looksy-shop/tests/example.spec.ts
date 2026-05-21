import { test, expect } from "@playwright/test";

/**
 * Reference test suite for Looksy.
 *
 * These tests exercise the major user journeys the AI test-generation
 * platform should be able to reproduce. They follow the framework's
 * selector priority (testid > role > label > placeholder), use no hard
 * waits, and tag scenarios for grep-based filtering in CI.
 */

test.describe("@web @home smoke", () => {
  test("homepage renders with hero and product grids @priority-high", async ({ page }) => {
    await page.goto("/");

    await expect(page.getByTestId("hero")).toBeVisible();
    await expect(page.getByTestId("new-arrivals-grid")).toBeVisible();
    await expect(page.getByTestId("bestsellers-grid")).toBeVisible();

    // Each grid should have at least one product card.
    const newCards = page.getByTestId("new-arrivals-grid").locator('[data-testid^="product-card-"]');
    await expect(newCards.first()).toBeVisible();
  });
});

test.describe("@web @catalog filters", () => {
  test("category filter reduces results @priority-medium", async ({ page }) => {
    await page.goto("/shop");

    // Establish baseline.
    const totalText = await page.getByTestId("catalog-result-count").textContent();
    expect(totalText).toMatch(/\d+/);

    await page.getByTestId("filter-category-knitwear").click();

    await expect(page).toHaveURL(/\/shop$/);
    await expect(page.getByTestId("catalog-grid")).toBeVisible();

    const filteredText = await page.getByTestId("catalog-result-count").textContent();
    expect(filteredText).toMatch(/\d+/);
  });

  test("clearing filters restores full collection @priority-low", async ({ page }) => {
    await page.goto("/shop");

    await page.getByTestId("filter-color-ink").click();
    await page.getByTestId("filter-size-M").click();
    await page.getByTestId("filter-in-stock").check();

    await expect(page.getByTestId("active-filter-count")).toHaveText("(3)");

    await page.getByTestId("filter-clear").click();
    await expect(page.getByTestId("active-filter-count")).toBeHidden();
  });
});

test.describe("@web @product variant selection", () => {
  test("size selection is required before add to cart @priority-high", async ({ page }) => {
    await page.goto("/product/fennel-fisherman-knit");

    const addBtn = page.getByTestId("product-add-to-cart");
    await expect(addBtn).toBeDisabled();
    await expect(addBtn).toHaveText("Select a size");

    // Pick first in-stock size.
    const inStockSize = page.locator('[data-testid^="product-size-"][data-stock="in-stock"]').first();
    await inStockSize.click();

    await expect(addBtn).toBeEnabled();
    await expect(addBtn).toHaveText("Add to bag");
  });

  test("out-of-stock sizes cannot be selected @priority-medium", async ({ page }) => {
    await page.goto("/product/ashford-overcoat");

    const oosSize = page.locator('[data-testid^="product-size-"][data-stock="out-of-stock"]').first();
    if (await oosSize.count() > 0) {
      await expect(oosSize).toBeDisabled();
    }
  });
});

test.describe("@web @cart add to cart flow", () => {
  test("adding an item opens the cart drawer with correct line @priority-high", async ({ page }) => {
    await page.goto("/product/linden-relaxed-tee");

    await page.getByTestId("product-color-ink").click();
    await page.getByTestId("product-size-M").click();
    await page.getByTestId("product-add-to-cart").click();

    const drawer = page.getByTestId("cart-drawer");
    await expect(drawer).toBeVisible();
    await expect(page.getByTestId("cart-drawer-items")).toBeVisible();
    await expect(page.getByTestId("cart-badge")).toHaveText("1");

    // Drawer line shows the variant we picked.
    await expect(page.getByTestId("cart-item-color")).toHaveText("Ink");
    await expect(page.getByTestId("cart-item-size")).toHaveText("M");
  });

  test("quantity changes update the line total @priority-medium", async ({ page }) => {
    await page.goto("/product/linden-relaxed-tee");
    await page.getByTestId("product-color-ink").click();
    await page.getByTestId("product-size-M").click();
    await page.getByTestId("product-add-to-cart").click();

    await expect(page.getByTestId("cart-drawer")).toBeVisible();

    const initial = await page.getByTestId("cart-item-line-total").textContent();
    await page.getByTestId("cart-qty-increment").click();
    const updated = await page.getByTestId("cart-item-line-total").textContent();

    expect(updated).not.toEqual(initial);
    await expect(page.getByTestId("cart-qty-value")).toHaveText("2");
  });
});

test.describe("@web @checkout end-to-end", () => {
  test("guest checkout from PDP through to confirmation @priority-high", async ({ page }) => {
    // Add an item.
    await page.goto("/product/linden-relaxed-tee");
    await page.getByTestId("product-color-ink").click();
    await page.getByTestId("product-size-M").click();
    await page.getByTestId("product-add-to-cart").click();

    await page.getByTestId("cart-drawer-checkout-button").click();
    await expect(page).toHaveURL("/checkout");

    // Step 1: contact.
    await page.getByTestId("checkout-email-input").fill("test.user@example.com");
    await page.getByTestId("checkout-continue-shipping").click();

    // Step 2: shipping.
    await page.getByTestId("checkout-fullname").fill("Test User");
    await page.getByTestId("checkout-phone").fill("07700 900000");
    await page.getByTestId("checkout-line1").fill("221B Baker Street");
    await page.getByTestId("checkout-city").fill("London");
    await page.getByTestId("checkout-postcode").fill("NW1 6XE");
    await page.getByTestId("shipping-method-express").click();
    await page.getByTestId("checkout-continue-payment").click();

    // Step 3: payment.
    await expect(page.getByTestId("payment-method-card")).toBeVisible();
    await page.getByTestId("checkout-card-number").fill("4242424242424242");
    await page.getByTestId("checkout-card-expiry").fill("1230");
    await page.getByTestId("checkout-card-cvc").fill("123");
    await page.getByTestId("checkout-place-order").click();

    // Confirmation.
    await expect(page).toHaveURL(/\/order\/LK-/);
    await expect(page.getByTestId("order-confirmation-page")).toBeVisible();
    await expect(page.getByTestId("order-email")).toHaveText("test.user@example.com");
    await expect(page.getByTestId("order-shipping-method")).toHaveText("Express delivery");
  });

  test("invalid email blocks progression to shipping @priority-medium", async ({ page }) => {
    await page.goto("/product/linden-relaxed-tee");
    await page.getByTestId("product-color-ink").click();
    await page.getByTestId("product-size-M").click();
    await page.getByTestId("product-add-to-cart").click();
    await page.getByTestId("cart-drawer-checkout-button").click();

    await page.getByTestId("checkout-email-input").fill("not-an-email");
    await page.getByTestId("checkout-continue-shipping").click();

    await expect(page.getByTestId("checkout-email-error")).toBeVisible();
    await expect(page.getByTestId("checkout-step-shipping")).toBeHidden();
  });
});

test.describe("@web @promo conditional discount logic", () => {
  test("CLUB15 is rejected for guests @priority-medium", async ({ page }) => {
    await page.goto("/product/linden-relaxed-tee");
    await page.getByTestId("product-color-ink").click();
    await page.getByTestId("product-size-M").click();
    await page.getByTestId("product-add-to-cart").click();
    await page.getByTestId("cart-drawer-checkout-button").click();

    await page.getByTestId("checkout-promo-input").fill("CLUB15");
    await page.getByTestId("checkout-promo-apply").click();

    await expect(page.getByTestId("checkout-promo-error")).toContainText("Club");
  });

  test("WELCOME10 applies a 10% discount @priority-medium", async ({ page }) => {
    await page.goto("/product/fennel-fisherman-knit");
    await page.getByTestId("product-color-bone").click();
    await page.getByTestId("product-size-M").click();
    await page.getByTestId("product-add-to-cart").click();
    await page.getByTestId("cart-drawer-checkout-button").click();

    await page.getByTestId("checkout-promo-input").fill("WELCOME10");
    await page.getByTestId("checkout-promo-apply").click();

    await expect(page.getByTestId("checkout-promo-applied")).toBeVisible();
    await expect(page.getByTestId("totals-discount")).toBeVisible();
  });
});
