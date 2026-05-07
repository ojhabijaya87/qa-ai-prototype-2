/**
 * Composite flow helpers.
 *
 * A POM owns interactions on a single page. A flow owns interactions
 * that SPAN multiple pages — like "add this variant to cart and proceed
 * to checkout, ending on the checkout page".
 *
 * Flows are not strictly necessary — a test could orchestrate POMs
 * directly. They exist because some compositions are repeated in 80%
 * of tests, and centralising them removes both noise and a class of
 * subtle bugs (e.g. one test forgetting to wait for the cart drawer
 * after add-to-cart).
 *
 * Rule of thumb: if 3+ tests need the exact same sequence, promote it
 * to a flow.
 */

import { ProductPage } from "../pages/product.page.js";
import { CartDrawerPage } from "../pages/cart-drawer.page.js";
import type { ProductVariant } from "../types/index.js";

/**
 * Add a variant to the cart from the product page. Leaves the user
 * on the product page with the cart drawer open (Looksy auto-opens
 * the drawer after a successful add).
 */
export async function addVariantToCart(args: {
  productPage: ProductPage;
  cartDrawer: CartDrawerPage;
  variant: ProductVariant;
  quantity?: number;
}): Promise<void> {
  const { productPage, cartDrawer, variant, quantity = 1 } = args;
  await productPage.goto(variant.productSlug);
  await productPage.selectColor(variant.colorId);
  await productPage.selectSize(variant.size);
  if (quantity > 1) {
    await productPage.setQuantity(quantity);
  }
  await productPage.addToCart();
  // Looksy auto-opens the drawer after a successful add. If the test
  // sees the drawer is hidden after this call, the add did not succeed
  // (e.g. variant was out of stock).
  await cartDrawer.expectItemPresent(variant);
}

/**
 * Add a variant and proceed all the way to the checkout page.
 * Useful prelude for any checkout test.
 */
export async function startCheckoutWithVariant(args: {
  productPage: ProductPage;
  cartDrawer: CartDrawerPage;
  variant: ProductVariant;
  quantity?: number;
}): Promise<void> {
  await addVariantToCart(args);
  await args.cartDrawer.proceedToCheckout();
}
