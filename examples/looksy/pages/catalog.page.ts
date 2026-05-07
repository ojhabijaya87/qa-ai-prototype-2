/**
 * Catalog page object model. Covers /shop and /shop/:category.
 *
 * The catalog page has the most state of any page in Looksy:
 *   - 6 categories, selectable as pills
 *   - 8 colour swatches (multi-select)
 *   - 7 size pills (multi-select)
 *   - Price range slider
 *   - In-stock and on-sale toggles
 *   - 5 sort orders
 *
 * The POM exposes one method per filter dimension. Tests compose them.
 */

import { Page, Locator, expect } from "@playwright/test";
import type { ProductCategory, ProductSize } from "../types/index.js";

type SortKey = "featured" | "price-asc" | "price-desc" | "rating" | "newest";

export class CatalogPage {
  constructor(private readonly page: Page) {}

  // ─── Locators ────────────────────────────────────────────────────────

  /** The main results grid. */
  get grid(): Locator {
    return this.page.getByTestId("catalog-grid");
  }

  /** The "N pieces" count shown above the grid. */
  get resultCount(): Locator {
    return this.page.getByTestId("catalog-result-count");
  }

  /** The toggle for the filter sidebar. */
  get filterToggle(): Locator {
    return this.page.getByTestId("filter-toggle");
  }

  /** Badge showing the count of currently-active filters. */
  get activeFilterCount(): Locator {
    return this.page.getByTestId("active-filter-count");
  }

  /** The empty state shown when no results match the current filters. */
  get emptyState(): Locator {
    return this.page.getByTestId("catalog-empty");
  }

  /** Sort dropdown control. */
  get sortSelect(): Locator {
    return this.page.getByTestId("sort-select");
  }

  /** Numeric label showing the current price slider value. */
  get priceValueLabel(): Locator {
    return this.page.getByTestId("filter-price-value");
  }

  /** "Clear all filters" button. Only visible when filters are active. */
  get clearFiltersButton(): Locator {
    return this.page.getByTestId("filter-clear");
  }

  // ─── Actions: navigation ─────────────────────────────────────────────

  /** Navigate directly to /shop (all products). */
  async gotoAll(): Promise<void> {
    await this.page.goto("/shop");
  }

  /** Navigate directly to a specific category, e.g. /shop/knitwear. */
  async gotoCategory(category: ProductCategory): Promise<void> {
    await this.page.goto(`/shop/${category}`);
  }

  // ─── Actions: filters ────────────────────────────────────────────────

  /**
   * Select a category from the filter sidebar. Pass `null` to select
   * "All". This MUTATES the URL via React state; assertions on URL
   * after this call are intentionally not made because the catalog
   * page does not currently sync state to URL beyond the initial route.
   */
  async filterByCategory(category: ProductCategory | null): Promise<void> {
    const testId = category === null
      ? "filter-category-all"
      : `filter-category-${category}`;
    await this.page.getByTestId(testId).click();
  }

  /**
   * Toggle a colour filter. Multiple colours can be selected — calling
   * this with the same colour twice toggles it off.
   */
  async toggleColor(colorId: string): Promise<void> {
    await this.page.getByTestId(`filter-color-${colorId}`).click();
  }

  /**
   * Toggle a size filter. Multiple sizes can be selected.
   */
  async toggleSize(size: ProductSize): Promise<void> {
    await this.page.getByTestId(`filter-size-${size}`).click();
  }

  /**
   * Set the maximum price slider. Value is in pence (e.g. 15000 = £150).
   */
  async setMaxPrice(pencePrice: number): Promise<void> {
    const slider = this.page.getByTestId("filter-price-range");
    await slider.fill(String(pencePrice));
  }

  /** Toggle the "In stock only" checkbox. */
  async toggleInStockOnly(): Promise<void> {
    await this.page.getByTestId("filter-in-stock").click();
  }

  /** Toggle the "On sale" checkbox. */
  async toggleOnSaleOnly(): Promise<void> {
    await this.page.getByTestId("filter-sale").click();
  }

  /**
   * Change the sort order. Use one of the supported sort keys; the model
   * should not invent new ones — they will fail to find the option.
   */
  async sortBy(key: SortKey): Promise<void> {
    await this.sortSelect.selectOption(key);
  }

  /** Clear all active filters. */
  async clearAllFilters(): Promise<void> {
    await this.clearFiltersButton.click();
  }

  // ─── Actions: navigation to a product ────────────────────────────────

  /**
   * Click into a product card by product id. After this call the product
   * page will be loading.
   */
  async openProduct(productId: string): Promise<void> {
    await this.page.getByTestId(`product-card-${productId}`).click();
  }

  // ─── Assertions ──────────────────────────────────────────────────────

  /** Get the current visible result count as a number. */
  async getResultCount(): Promise<number> {
    const text = await this.resultCount.textContent();
    if (!text) return 0;
    const match = text.match(/(\d+)/);
    return match ? parseInt(match[1], 10) : 0;
  }

  /** Verify the catalog page is loaded and showing results. */
  async expectLoaded(): Promise<void> {
    await expect(this.grid).toBeVisible();
    await expect(this.resultCount).toBeVisible();
  }

  /** Verify the active filter count badge shows the expected value. */
  async expectActiveFilterCount(count: number): Promise<void> {
    if (count === 0) {
      await expect(this.activeFilterCount).toBeHidden();
    } else {
      await expect(this.activeFilterCount).toHaveText(`(${count})`);
    }
  }

  /** Verify the empty state is shown (no results match filters). */
  async expectEmpty(): Promise<void> {
    await expect(this.emptyState).toBeVisible();
  }
}
