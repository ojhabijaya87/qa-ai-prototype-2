/**
 * Sample test — the conventions in action.
 *
 * The AI test generator should produce tests that look like this. Use
 * this file as a reference for what "framework-aligned" means:
 *
 *   ✓ Imports `test` and `expect` from the looksy fixture (NEVER from @playwright/test)
 *   ✓ Test name includes the @web @<domain> @priority-<level> tags
 *   ✓ Destructures POMs from the test callback's first arg
 *   ✓ No raw locators — uses POM methods exclusively
 *   ✓ No hard waits (waitForTimeout, sleep) — relies on Playwright auto-waiting
 *   ✓ Uses test data factories and the VARIANTS catalogue rather than literals
 */

import { test, expect } from "../fixtures/looksy.fixture.js";
import { clubMemberTest } from "../fixtures/authenticated.fixture.js";
import { VARIANTS, PROMO_CODES, buildDeliveryAddress, buildCardDetails } from "../test-data/factories.js";
import { addVariantToCart, startCheckoutWithVariant } from "../utils/flows.js";

// ─── Smoke ──────────────────────────────────────────────────────────────

test("home page loads with hero and grids @web @home @priority-high", async ({ homePage }) => {
  await homePage.goto();
  await homePage.expectLoaded();
});

// ─── Catalog filters ────────────────────────────────────────────────────

test("filtering by knitwear reduces results @web @catalog @priority-medium", async ({ catalogPage }) => {
  await catalogPage.gotoAll();
  const totalCount = await catalogPage.getResultCount();

  await catalogPage.filterByCategory("knitwear");

  const filteredCount = await catalogPage.getResultCount();
  expect(filteredCount).toBeLessThan(totalCount);
});

test("clearing filters restores full collection @web @catalog @priority-low", async ({ catalogPage }) => {
  await catalogPage.gotoAll();
  await catalogPage.toggleColor("ink");
  await catalogPage.toggleSize("M");
  await catalogPage.toggleInStockOnly();
  await catalogPage.expectActiveFilterCount(3);

  await catalogPage.clearAllFilters();
  await catalogPage.expectActiveFilterCount(0);
});

// ─── Product variant selection ──────────────────────────────────────────

test("size must be selected before add to cart @web @product @priority-high", async ({ productPage }) => {
  await productPage.goto(VARIANTS.KNIT_BONE_M.productSlug);
  await productPage.expectMustSelectSize();

  await productPage.selectColor(VARIANTS.KNIT_BONE_M.colorId);
  await productPage.selectSize(VARIANTS.KNIT_BONE_M.size);
  await productPage.expectReadyToAdd();
});

// ─── Cart flow ──────────────────────────────────────────────────────────

test("adding a variant updates the cart badge @web @cart @priority-high", async ({ productPage, cartDrawer }) => {
  await addVariantToCart({
    productPage,
    cartDrawer,
    variant: VARIANTS.TEE_INK_M,
  });
  await cartDrawer.expectBadgeCount(1);
});

// ─── End-to-end checkout ────────────────────────────────────────────────

test("guest can checkout with card @web @checkout @priority-high", async ({
  productPage,
  cartDrawer,
  checkoutPage,
  orderConfirmationPage,
}) => {
  await startCheckoutWithVariant({
    productPage,
    cartDrawer,
    variant: VARIANTS.TEE_INK_M,
  });

  await checkoutPage.expectOnContactStep();
  await checkoutPage.fillContactAndContinue("guest@looksy.test");

  await checkoutPage.expectOnShippingStep();
  await checkoutPage.fillAddress(buildDeliveryAddress());
  await checkoutPage.selectShippingMethod("standard");
  await checkoutPage.continueToPayment();

  await checkoutPage.expectOnPaymentStep();
  await checkoutPage.selectPaymentMethod("card");
  await checkoutPage.fillCardDetails(buildCardDetails());
  await checkoutPage.placeOrder();

  await orderConfirmationPage.expectLoaded();
  await orderConfirmationPage.expectEmail("guest@looksy.test");
});

// ─── Promo code edge cases ──────────────────────────────────────────────

test("CLUB15 is rejected for guests @web @promo @priority-medium", async ({
  productPage,
  cartDrawer,
  checkoutPage,
}) => {
  await startCheckoutWithVariant({
    productPage,
    cartDrawer,
    variant: VARIANTS.TEE_INK_M,
  });
  await checkoutPage.applyPromoCode(PROMO_CODES.CLUB15);
  await checkoutPage.expectPromoError("Club");
});

clubMemberTest("CLUB15 is accepted for club members @web @promo @priority-medium", async ({
  productPage,
  cartDrawer,
  checkoutPage,
}) => {
  await startCheckoutWithVariant({
    productPage,
    cartDrawer,
    variant: VARIANTS.KNIT_BONE_M,
  });
  await checkoutPage.applyPromoCode(PROMO_CODES.CLUB15);
  await checkoutPage.expectPromoApplied();
});
