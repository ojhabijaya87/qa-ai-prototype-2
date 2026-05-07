/**
 * Checkout page object model. Covers /checkout.
 *
 * The checkout is a three-step stepper:
 *   1. Contact   — email
 *   2. Shipping  — address + delivery method
 *   3. Payment   — payment method + (if card) card details
 *
 * Each step gates progression on its own validation. The POM exposes
 * a method per step that handles validation and progression as a unit.
 */

import { Page, Locator, expect } from "@playwright/test";
import type {
  DeliveryAddress,
  CardDetails,
  PaymentMethod,
  ShippingMethod,
} from "../types/index.js";

export class CheckoutPage {
  constructor(private readonly page: Page) {}

  // ─── Locators: top-level ─────────────────────────────────────────────

  get container(): Locator {
    return this.page.getByTestId("checkout-page");
  }

  get summary(): Locator {
    return this.page.getByTestId("checkout-summary");
  }

  // ─── Locators: contact step ──────────────────────────────────────────

  get contactStep(): Locator {
    return this.page.getByTestId("checkout-step-contact");
  }

  get emailInput(): Locator {
    return this.page.getByTestId("checkout-email-input");
  }

  get emailError(): Locator {
    return this.page.getByTestId("checkout-email-error");
  }

  get continueToShippingButton(): Locator {
    return this.page.getByTestId("checkout-continue-shipping");
  }

  // ─── Locators: shipping step ─────────────────────────────────────────

  get shippingStep(): Locator {
    return this.page.getByTestId("checkout-step-shipping");
  }

  get fullNameInput(): Locator {
    return this.page.getByTestId("checkout-fullname");
  }

  get phoneInput(): Locator {
    return this.page.getByTestId("checkout-phone");
  }

  get line1Input(): Locator {
    return this.page.getByTestId("checkout-line1");
  }

  get line2Input(): Locator {
    return this.page.getByTestId("checkout-line2");
  }

  get cityInput(): Locator {
    return this.page.getByTestId("checkout-city");
  }

  get postcodeInput(): Locator {
    return this.page.getByTestId("checkout-postcode");
  }

  get countryInput(): Locator {
    return this.page.getByTestId("checkout-country");
  }

  get continueToPaymentButton(): Locator {
    return this.page.getByTestId("checkout-continue-payment");
  }

  // ─── Locators: payment step ──────────────────────────────────────────

  get paymentStep(): Locator {
    return this.page.getByTestId("checkout-step-payment");
  }

  get cardNumberInput(): Locator {
    return this.page.getByTestId("checkout-card-number");
  }

  get cardExpiryInput(): Locator {
    return this.page.getByTestId("checkout-card-expiry");
  }

  get cardCvcInput(): Locator {
    return this.page.getByTestId("checkout-card-cvc");
  }

  get placeOrderButton(): Locator {
    return this.page.getByTestId("checkout-place-order");
  }

  // ─── Locators: promo & summary ───────────────────────────────────────

  get promoInput(): Locator {
    return this.page.getByTestId("checkout-promo-input");
  }

  get promoApplyButton(): Locator {
    return this.page.getByTestId("checkout-promo-apply");
  }

  get promoApplied(): Locator {
    return this.page.getByTestId("checkout-promo-applied");
  }

  get promoError(): Locator {
    return this.page.getByTestId("checkout-promo-error");
  }

  get totalsSubtotal(): Locator {
    return this.page.getByTestId("totals-subtotal");
  }

  get totalsDiscount(): Locator {
    return this.page.getByTestId("totals-discount");
  }

  get totalsShipping(): Locator {
    return this.page.getByTestId("totals-shipping");
  }

  get totalsTotal(): Locator {
    return this.page.getByTestId("totals-total");
  }

  // ─── Actions: navigation ─────────────────────────────────────────────

  async goto(): Promise<void> {
    await this.page.goto("/checkout");
  }

  // ─── Actions: step 1 — contact ───────────────────────────────────────

  /**
   * Fill the email field and progress to the shipping step.
   * If the email is invalid, this method will leave the page on the
   * contact step and the caller can assert on emailError.
   */
  async fillContactAndContinue(email: string): Promise<void> {
    await this.emailInput.fill(email);
    await this.continueToShippingButton.click();
  }

  // ─── Actions: step 2 — shipping ──────────────────────────────────────

  /**
   * Fill the address form. Doesn't progress to the next step — call
   * selectShippingMethod() and continueToPayment() to do that.
   */
  async fillAddress(address: DeliveryAddress): Promise<void> {
    await this.fullNameInput.fill(address.fullName);
    await this.phoneInput.fill(address.phone);
    await this.line1Input.fill(address.line1);
    if (address.line2) {
      await this.line2Input.fill(address.line2);
    }
    await this.cityInput.fill(address.city);
    await this.postcodeInput.fill(address.postcode);
    await this.countryInput.fill(address.country);
  }

  async selectShippingMethod(method: ShippingMethod): Promise<void> {
    await this.page.getByTestId(`shipping-method-${method}`).click();
  }

  async continueToPayment(): Promise<void> {
    await this.continueToPaymentButton.click();
  }

  // ─── Actions: step 3 — payment ───────────────────────────────────────

  async selectPaymentMethod(method: PaymentMethod): Promise<void> {
    await this.page.getByTestId(`payment-method-${method}`).click();
  }

  async fillCardDetails(card: CardDetails): Promise<void> {
    await this.cardNumberInput.fill(card.number);
    await this.cardExpiryInput.fill(card.expiry);
    await this.cardCvcInput.fill(card.cvc);
  }

  async placeOrder(): Promise<void> {
    await this.placeOrderButton.click();
  }

  // ─── Actions: promo ──────────────────────────────────────────────────

  /**
   * Apply a promo code. Does not throw on rejection — the caller is
   * responsible for asserting on the success or error state.
   */
  async applyPromoCode(code: string): Promise<void> {
    await this.promoInput.fill(code);
    await this.promoApplyButton.click();
  }

  // ─── Assertions ──────────────────────────────────────────────────────

  async expectOnContactStep(): Promise<void> {
    await expect(this.contactStep).toBeVisible();
  }

  async expectOnShippingStep(): Promise<void> {
    await expect(this.shippingStep).toBeVisible();
  }

  async expectOnPaymentStep(): Promise<void> {
    await expect(this.paymentStep).toBeVisible();
  }

  async expectPromoApplied(): Promise<void> {
    await expect(this.promoApplied).toBeVisible();
  }

  async expectPromoError(messageContains?: string): Promise<void> {
    await expect(this.promoError).toBeVisible();
    if (messageContains) {
      await expect(this.promoError).toContainText(messageContains);
    }
  }
}
