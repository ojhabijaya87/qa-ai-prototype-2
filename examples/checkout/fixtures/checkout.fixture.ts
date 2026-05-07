import { test as base } from "@playwright/test";
import { CartPage } from "../pages/cart.page";
import { CheckoutPage } from "../pages/checkout.page";

type CheckoutFixtures = {
  cartPage: CartPage;
  checkoutPage: CheckoutPage;
};

export const test = base.extend<CheckoutFixtures>({
  cartPage: async ({ page }, use) => {
    await use(new CartPage(page));
  },
  checkoutPage: async ({ page }, use) => {
    await use(new CheckoutPage(page));
  },
});

export { expect } from "@playwright/test";
