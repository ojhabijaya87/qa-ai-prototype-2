/**
 * Cart drawer object model.
 *
 * The cart drawer is a global UI surface — it lives at the App level,
 * not inside any single page. It can be opened from any page by clicking
 * the cart icon in the header, or it auto-opens when an item is added
 * to the cart from the product page.
 *
 * Because it's global, the cart drawer POM does not have a goto() method.
 * Tests open it via the CartDrawerPage.open() method or by triggering
 * an add-to-cart flow that auto-opens it.
 */

import { Page, Locator, expect } from "@playwright/test";
import { cartItemTestId } from "../utils/selectors.js";
import type { ProductVariant } from "../types/index.js";

export class CartDrawerPage {
  constructor(private readonly page: Page) {}

  // ─── Locators ────────────────────────────────────────────────────────

  get drawer(): Locator {
    return this.page.getByTestId("cart-drawer");
  }

  get backdrop(): Locator {
    return this.page.getByTestId("cart-drawer-backdrop");
  }

  get closeButton(): Locator {
    return this.page.getByTestId("cart-drawer-close");
  }

  get items(): Locator {
    return this.page.getByTestId("cart-drawer-items");
  }

  get emptyState(): Locator {
    return this.page.getByTestId("cart-drawer-empty");
  }

  get subtotal(): Locator {
    return this.page.getByTestId("cart-drawer-subtotal");
  }

  get checkoutButton(): Locator {
    return this.page.getByTestId("cart-drawer-checkout-button");
  }

  /** The cart icon in the header, with its item count badge. */
  get cartIcon(): Locator {
    return this.page.getByTestId("cart-icon");
  }

  /** The numeric badge on the cart icon. Hidden when cart is empty. */
  get cartBadge(): Locator {
    return this.page.getByTestId("cart-badge");
  }

  // ─── Actions ─────────────────────────────────────────────────────────

  /** Open the cart drawer by clicking the header cart icon. */
  async open(): Promise<void> {
    await this.cartIcon.click();
    await expect(this.drawer).toBeVisible();
  }

  /** Close by clicking the close button (rather than the backdrop). */
  async close(): Promise<void> {
    await this.closeButton.click();
    await expect(this.drawer).toBeHidden();
  }

  /** Close by clicking outside the drawer (on the backdrop). */
  async closeViaBackdrop(): Promise<void> {
    await this.backdrop.click();
    await expect(this.drawer).toBeHidden();
  }

  /**
   * Increment the quantity of a specific cart line.
   * Note: the button is disabled when the line has reached the variant's
   * stock limit; the caller should not call this if expecting a no-op.
   */
  async incrementQuantity(productId: string): Promise<void> {
    const lineQty = this.page.getByTestId(`cart-qty-${productId}`);
    await lineQty.getByTestId("cart-qty-increment").click();
  }

  /** Decrement the quantity of a specific cart line. */
  async decrementQuantity(productId: string): Promise<void> {
    const lineQty = this.page.getByTestId(`cart-qty-${productId}`);
    await lineQty.getByTestId("cart-qty-decrement").click();
  }

  /** Remove a cart line entirely. */
  async removeItem(productId: string): Promise<void> {
    await this.page.getByTestId(`cart-remove-${productId}`).click();
  }

  /** Click the checkout CTA at the bottom of the drawer. */
  async proceedToCheckout(): Promise<void> {
    await this.checkoutButton.click();
  }

  // ─── Assertions ──────────────────────────────────────────────────────

  /**
   * Verify the cart icon shows the expected badge count. Pass 0 to
   * assert the badge is hidden.
   */
  async expectBadgeCount(count: number): Promise<void> {
    if (count === 0) {
      await expect(this.cartBadge).toBeHidden();
    } else {
      await expect(this.cartBadge).toHaveText(String(count));
    }
  }

  /**
   * Verify a specific variant is in the cart. Builds the testid from
   * the variant's identifying fields.
   */
  async expectItemPresent(variant: ProductVariant): Promise<void> {
    const testId = cartItemTestId({
      productId: variant.productId,
      colorId: variant.colorId,
      size: variant.size,
    });
    await expect(this.page.getByTestId(testId)).toBeVisible();
  }

  /** Verify the empty state is showing. */
  async expectEmpty(): Promise<void> {
    await expect(this.emptyState).toBeVisible();
  }
}
