/**
 * Home page object model.
 *
 * Pattern: lazy proxy POM. Locators are exposed as getters so they
 * resolve at access time, never at construction time. This means a POM
 * instance is cheap to create and hold across many tests, and a stale
 * locator can never live longer than a single await.
 *
 * Convention: every locator is named after what it represents, not how
 * it's selected. `heroOuterwearCta` not `firstButtonInHero`.
 */

import { Page, Locator, expect } from "@playwright/test";

export class HomePage {
  /**
   * @param page - the Playwright page. Injected by the fixture, never
   *               constructed manually in a test.
   */
  constructor(private readonly page: Page) {}

  // ─── Locators ────────────────────────────────────────────────────────

  /** The hero section at the top of the page. */
  get hero(): Locator {
    return this.page.getByTestId("hero");
  }

  /** "Shop outerwear" CTA in the hero. Navigates to /shop/outerwear. */
  get heroOuterwearCta(): Locator {
    return this.page.getByTestId("hero-cta-outerwear");
  }

  /** "View the collection" text link in the hero. Navigates to /shop. */
  get heroAllCta(): Locator {
    return this.page.getByTestId("hero-cta-all");
  }

  /** The grid of new arrival products. */
  get newArrivalsGrid(): Locator {
    return this.page.getByTestId("new-arrivals-grid");
  }

  /** The grid of bestseller products. */
  get bestsellersGrid(): Locator {
    return this.page.getByTestId("bestsellers-grid");
  }

  /** The editorial section near the bottom of the page. */
  get editorialSection(): Locator {
    return this.page.getByTestId("editorial-section");
  }

  // ─── Actions ─────────────────────────────────────────────────────────

  /**
   * Navigate to the home page directly. Use this in tests that begin on
   * the home page rather than relying on a previous step's URL.
   */
  async goto(): Promise<void> {
    await this.page.goto("/");
  }

  /**
   * Click the hero CTA to start an outerwear journey.
   * Waits for the catalog page to be visible before returning.
   */
  async startOuterwearJourney(): Promise<void> {
    await this.heroOuterwearCta.click();
    await this.page.getByTestId("catalog-page").waitFor();
  }

  // ─── Assertions ──────────────────────────────────────────────────────

  /**
   * Verify the home page is fully loaded. Use this as a smoke check
   * at the start of any test that begins from /.
   */
  async expectLoaded(): Promise<void> {
    await expect(this.hero).toBeVisible();
    await expect(this.newArrivalsGrid).toBeVisible();
    await expect(this.bestsellersGrid).toBeVisible();
  }
}
