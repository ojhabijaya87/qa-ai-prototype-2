/**
 * Selector helpers.
 *
 * The framework's selector priority is:
 *   1. data-testid    — preferred for any interactive element
 *   2. ARIA role      — for accessible elements without a stable testid
 *   3. label / placeholder — last resort, fragile to copy changes
 *
 * Hard rules (enforced by ESLint and by the AI test generator's validators):
 *   - NO CSS class selectors (`.cart-icon`)
 *   - NO XPath
 *   - NO `page.locator()` with a CSS string
 *   - NO `await page.waitForTimeout()` — use auto-waiting locators
 *
 * These helpers exist so that POMs read consistently and so that selector
 * strategy is one decision in one place rather than 200 decisions across
 * the codebase.
 */

import { Page, Locator } from "@playwright/test";

/**
 * Get a locator by testid. Equivalent to `page.getByTestId(id)` but
 * named to make the intent obvious in POMs.
 *
 * @example
 *   const addButton = byTestId(page, "product-add-to-cart");
 */
export function byTestId(page: Page, testId: string): Locator {
  return page.getByTestId(testId);
}

/**
 * Get a locator by testid prefix. Useful for selecting all instances of
 * a repeating element — like every product card in a grid.
 *
 * @example
 *   const allCards = byTestIdPrefix(page, "product-card-");
 *   await expect(allCards).toHaveCount(16);
 */
export function byTestIdPrefix(page: Page, prefix: string): Locator {
  // Playwright supports CSS attribute selectors via getByTestId is exact-match,
  // so for prefixes we fall through to a single locator() call. This is the
  // ONE place CSS selection is allowed — encapsulated in this helper.
  return page.locator(`[data-testid^="${prefix}"]`);
}

/**
 * Get a locator scoped to a specific product card by product id.
 * Used heavily in catalogue tests where many products are visible at once.
 *
 * @example
 *   const card = productCard(page, "p-002");
 *   await card.click();
 */
export function productCard(page: Page, productId: string): Locator {
  return page.getByTestId(`product-card-${productId}`);
}

/**
 * Build the testid for a cart line item. Cart items are identified by
 * the composite of productId, colorId and size.
 *
 * @example
 *   const line = cartItemTestId({ productId: "p-002", colorId: "moss", size: "M" });
 *   await page.getByTestId(line).click();
 */
export function cartItemTestId(args: {
  productId: string;
  colorId: string;
  size: string;
}): string {
  return `cart-item-${args.productId}-${args.colorId}-${args.size}`;
}
