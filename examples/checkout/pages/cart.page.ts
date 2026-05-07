// Example POM in the lazy proxy pattern.
// This mirrors the New Look convention: locators as getters, no eager
// instantiation in the constructor.

import { Page, Locator } from "@playwright/test";

export class CartPage {
  constructor(private readonly page: Page) {}

  get cartItems(): Locator {
    return this.page.getByTestId("cart-item");
  }

  get checkoutButton(): Locator {
    return this.page.getByRole("button", { name: "Checkout" });
  }

  get totalPrice(): Locator {
    return this.page.getByTestId("cart-total");
  }

  get emptyCartMessage(): Locator {
    return this.page.getByText("Your cart is empty");
  }

  async removeItem(itemName: string): Promise<void> {
    await this.cartItems.filter({ hasText: itemName }).getByRole("button", { name: "Remove" }).click();
  }

  async getItemCount(): Promise<number> {
    return await this.cartItems.count();
  }
}
