/**
 * Order confirmation page object model. Covers /order/:orderId.
 *
 * Reached after a successful checkout. The order id is part of the URL
 * and also visible on the page; tests can extract it from either source.
 */

import { Page, Locator, expect } from "@playwright/test";

export class OrderConfirmationPage {
  constructor(private readonly page: Page) {}

  // ─── Locators ────────────────────────────────────────────────────────

  get container(): Locator {
    return this.page.getByTestId("order-confirmation-page");
  }

  get orderId(): Locator {
    return this.page.getByTestId("order-id");
  }

  get orderEmail(): Locator {
    return this.page.getByTestId("order-email");
  }

  get shippingMethod(): Locator {
    return this.page.getByTestId("order-shipping-method");
  }

  get paymentMethod(): Locator {
    return this.page.getByTestId("order-payment-method");
  }

  get total(): Locator {
    return this.page.getByTestId("order-total");
  }

  get discount(): Locator {
    return this.page.getByTestId("order-discount");
  }

  // ─── Assertions ──────────────────────────────────────────────────────

  /**
   * Verify the page has loaded and we're on a confirmation URL.
   * Use this as the smoke check after placeOrder() to confirm the
   * checkout succeeded.
   */
  async expectLoaded(): Promise<void> {
    await expect(this.container).toBeVisible();
    await expect(this.page).toHaveURL(/\/order\/LK-/);
  }

  /** Extract the order id from the URL. */
  async getOrderIdFromUrl(): Promise<string> {
    const url = this.page.url();
    const match = url.match(/\/order\/(LK-[A-Z0-9-]+)/);
    if (!match) {
      throw new Error(`Could not extract order id from URL: ${url}`);
    }
    return match[1];
  }

  /** Verify the email shown on the confirmation matches what was entered. */
  async expectEmail(email: string): Promise<void> {
    await expect(this.orderEmail).toHaveText(email);
  }

  /** Verify a discount line appears on the confirmation. */
  async expectHasDiscount(): Promise<void> {
    await expect(this.discount).toBeVisible();
  }


get thankYouMessage(): Locator {
  return this.page.getByTestId("order-confirmation-thankyou");
}
}
