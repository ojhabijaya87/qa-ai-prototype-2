import { Page, Locator } from "@playwright/test";

export class CheckoutPage {
  constructor(private readonly page: Page) {}

  get emailInput(): Locator {
    return this.page.getByLabel("Email");
  }

  get continueAsGuestButton(): Locator {
    return this.page.getByRole("button", { name: "Continue as guest" });
  }

  get paymentMethodKlarna(): Locator {
    return this.page.getByTestId("payment-klarna");
  }

  get paymentMethodCard(): Locator {
    return this.page.getByTestId("payment-card");
  }

  get placeOrderButton(): Locator {
    return this.page.getByRole("button", { name: "Place order" });
  }

  get orderConfirmation(): Locator {
    return this.page.getByTestId("order-confirmation");
  }

  async selectKlarna(): Promise<void> {
    await this.paymentMethodKlarna.click();
  }
}
