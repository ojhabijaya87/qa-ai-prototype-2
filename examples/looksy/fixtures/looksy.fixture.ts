/**
 * Main test fixture.
 *
 * This fixture extends Playwright's base test with all Looksy POMs and
 * test data factories. Generated tests MUST import { test, expect } from
 * this file, NOT from @playwright/test directly. The validator enforces
 * this.
 *
 * Why? Two reasons:
 *   1. POMs are pre-instantiated per test — no `new HomePage(page)` boilerplate.
 *   2. The fixture can do per-test setup (storage state, route mocking, etc.)
 *      transparently. If we add a new piece of setup, every test gets it
 *      for free without changing test code.
 *
 * Pattern: lazy fixture initialisation. The POMs are constructed when
 * first accessed — `await use(new HomePage(page))` — not during fixture
 * resolution. Combined with the lazy proxy POM pattern, this means a
 * test that only uses CartDrawerPage doesn't pay the cost of building
 * five other POMs it never touches.
 */

import { test as base } from "@playwright/test";
import { HomePage } from "../pages/home.page.js";
import { CatalogPage } from "../pages/catalog.page.js";
import { ProductPage } from "../pages/product.page.js";
import { CartDrawerPage } from "../pages/cart-drawer.page.js";
import { CheckoutPage } from "../pages/checkout.page.js";
import { OrderConfirmationPage } from "../pages/order-confirmation.page.js";
import { AccountPage } from "../pages/account.page.js";

/**
 * Fixtures available in every Looksy test.
 *
 * Generated tests should destructure these from the test callback's first
 * argument:
 *
 *   test("name @web @home @priority-high", async ({ homePage }) => {
 *     await homePage.goto();
 *     await homePage.expectLoaded();
 *   });
 */
type LooksyFixtures = {
  homePage: HomePage;
  catalogPage: CatalogPage;
  productPage: ProductPage;
  cartDrawer: CartDrawerPage;
  checkoutPage: CheckoutPage;
  orderConfirmationPage: OrderConfirmationPage;
  accountPage: AccountPage;
};

export const test = base.extend<LooksyFixtures>({
  homePage: async ({ page }, use) => {
    await use(new HomePage(page));
  },
  catalogPage: async ({ page }, use) => {
    await use(new CatalogPage(page));
  },
  productPage: async ({ page }, use) => {
    await use(new ProductPage(page));
  },
  cartDrawer: async ({ page }, use) => {
    await use(new CartDrawerPage(page));
  },
  checkoutPage: async ({ page }, use) => {
    await use(new CheckoutPage(page));
  },
  orderConfirmationPage: async ({ page }, use) => {
    await use(new OrderConfirmationPage(page));
  },
  accountPage: async ({ page }, use) => {
    await use(new AccountPage(page));
  },
});

/**
 * Re-export `expect` so generated tests don't need a second import.
 * The validator looks for this exact import shape:
 *   import { test, expect } from "../fixtures/looksy.fixture";
 */
export { expect } from "@playwright/test";
