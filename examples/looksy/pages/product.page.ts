/**
 * Product detail page object model. Covers /product/:slug.
 *
 * The product page is the most state-rich single-page surface in Looksy:
 *   - Color and size selection, with stock-aware UI (sizes strike through
 *     when out of stock for the current colour)
 *   - Quantity stepper
 *   - Add to cart with three possible outcomes (success, out of stock,
 *     exceeds stock)
 *   - Accordions for details, shipping, returns
 *   - Related product grid
 *   - Image gallery with thumbnail navigation
 */

import { Page, Locator, expect } from "@playwright/test";
import type { ProductSize } from "../types/index.js";

export class ProductPage {
  async addToBag(): Promise<void> {
  await this.addToCart();
}
  constructor(private readonly page: Page) {}

  // ─── Locators ────────────────────────────────────────────────────────

  get container(): Locator {
    return this.page.getByTestId("product-page");
  }

  get name(): Locator {
    return this.page.getByTestId("product-name");
  }

  get price(): Locator {
    return this.page.getByTestId("product-price");
  }

  get comparePrice(): Locator {
    return this.page.getByTestId("product-compare-price");
  }

  get selectedColorLabel(): Locator {
    return this.page.getByTestId("product-selected-color");
  }

  get addToCartButton(): Locator {
    return this.page.getByTestId("product-add-to-cart");
  }

  get lowStockWarning(): Locator {
    return this.page.getByTestId("product-low-stock-warning");
  }

  get qtyValue(): Locator {
    return this.page.getByTestId("product-qty-value");
  }

  get qtyIncrement(): Locator {
    return this.page.getByTestId("product-qty-increment");
  }

  get qtyDecrement(): Locator {
    return this.page.getByTestId("product-qty-decrement");
  }

  get galleryMainImage(): Locator {
    return this.page.getByTestId("product-gallery-main-image");
  }

  // ─── Actions: navigation ─────────────────────────────────────────────

  /**
   * Navigate to a specific product page by slug.
   * @example
   *   await productPage.goto("fennel-fisherman-knit");
   */
  async goto(slug: string): Promise<void> {
    await this.page.goto(`/product/${slug}`);
  }

  // ─── Actions: variant selection ──────────────────────────────────────

  /**
   * Select a colour by id. Each Looksy product has 2-4 colours.
   * After selection, the size grid updates to reflect stock for the
   * newly-selected colour, so callers should select colour BEFORE size.
   */
  async selectColor(colorId: string): Promise<void> {
    await this.page.getByTestId(`product-color-${colorId}`).click();
  }

  /**
   * Select a size. If the size is out of stock for the current colour,
   * the button will be disabled — selectSize() will fail loudly rather
   * than silently no-op (we want the test to surface the assumption
   * mismatch).
   */
  async selectSize(size: ProductSize): Promise<void> {
  const sizeButton = this.page.getByTestId(`product-size-${size}`);
  await sizeButton.waitFor({ state: 'visible' }); // optional
  await expect(sizeButton).toBeEnabled();
  await sizeButton.click();
}

  /**
   * Set quantity by clicking +/- to reach the target value. Use this
   * rather than typing into a field — there's no input, only a stepper.
   */
  async setQuantity(target: number): Promise<void> {
    const current = parseInt((await this.qtyValue.textContent()) ?? "1", 10);
    const delta = target - current;
    const button = delta > 0 ? this.qtyIncrement : this.qtyDecrement;
    for (let i = 0; i < Math.abs(delta); i++) {
      await button.click();
    }
  }

  /** Click the add-to-cart button. Caller is responsible for handling outcomes. */
  async addToCart(): Promise<void> {
    await this.addToCartButton.click();
  }

  // ─── Actions: accordions ─────────────────────────────────────────────

  /** Toggle one of the three product info accordions. */
  async toggleAccordion(section: "details" | "shipping" | "returns"): Promise<void> {
    await this.page.getByTestId(`accordion-toggle-${section}`).click();
  }

  // ─── Assertions ──────────────────────────────────────────────────────

  /** Verify the page is loaded with the expected product. */
  async expectLoaded(productName: string): Promise<void> {
    await expect(this.container).toBeVisible();
    await expect(this.name).toHaveText(productName);
  }

  /**
   * Verify a size shows as out of stock. The button will be disabled
   * and have the data-stock="out-of-stock" attribute.
   */
  async expectSizeOutOfStock(size: ProductSize): Promise<void> {
    const sizeButton = this.page.getByTestId(`product-size-${size}`);
    await expect(sizeButton).toBeDisabled();
    await expect(sizeButton).toHaveAttribute("data-stock", "out-of-stock");
  }

  /** Verify the add-to-cart button is in its "select a size" state. */
  async expectMustSelectSize(): Promise<void> {
    await expect(this.addToCartButton).toBeDisabled();
    await expect(this.addToCartButton).toHaveText("Select a size");
  }

  /** Verify the add-to-cart button is enabled and ready. */
  async expectReadyToAdd(): Promise<void> {
    await expect(this.addToCartButton).toBeEnabled();
    await expect(this.addToCartButton).toHaveText("Add to bag");
  }

  /** Verify the low-stock warning is showing for the current variant. */
  async expectLowStockWarning(): Promise<void> {
    await expect(this.lowStockWarning).toBeVisible();
  }
}
