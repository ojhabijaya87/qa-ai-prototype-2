/**
 * Account page object model. Covers /account.
 *
 * Two states:
 *   - Signed out: shows a sign-in form
 *   - Signed in:  shows profile info, club toggle, order history
 *
 * "Sign in" is a demo flow — there's no password, just name + email
 * + an optional club checkbox. The state persists via Zustand so a
 * sign-in survives page reloads.
 */

import { Page, Locator, expect } from "@playwright/test";
import type { TestUser } from "../types/index.js";

export class AccountPage {
  constructor(private readonly page: Page) {}

  // ─── Locators: shared ────────────────────────────────────────────────

  get container(): Locator {
    return this.page.getByTestId("account-page");
  }

  // ─── Locators: sign-in form (signed out state) ───────────────────────

  get signinCard(): Locator {
    return this.page.getByTestId("account-signin-card");
  }

  get fullNameInput(): Locator {
    return this.page.getByTestId("signin-fullname-input");
  }

  get emailInput(): Locator {
    return this.page.getByTestId("signin-email-input");
  }

  get clubCheckbox(): Locator {
    return this.page.getByTestId("signin-club-checkbox");
  }

  get submitButton(): Locator {
    return this.page.getByTestId("signin-submit");
  }

  // ─── Locators: profile (signed in state) ─────────────────────────────

  get infoCard(): Locator {
    return this.page.getByTestId("account-info-card");
  }

  get profileFullName(): Locator {
    return this.page.getByTestId("account-fullname");
  }

  get profileEmail(): Locator {
    return this.page.getByTestId("account-email");
  }

  get clubStatus(): Locator {
    return this.page.getByTestId("account-club-status");
  }

  get toggleClubButton(): Locator {
    return this.page.getByTestId("account-toggle-club");
  }

  get signOutButton(): Locator {
    return this.page.getByTestId("account-signout");
  }

  get ordersCard(): Locator {
    return this.page.getByTestId("account-orders-card");
  }

  get ordersList(): Locator {
    return this.page.getByTestId("account-orders-list");
  }

  get ordersEmpty(): Locator {
    return this.page.getByTestId("account-orders-empty");
  }

  // ─── Actions ─────────────────────────────────────────────────────────

  async goto(): Promise<void> {
    await this.page.goto("/account");
  }

  /**
   * Sign in with the given user. The user object's `isClubMember` flag
   * controls whether the club checkbox is ticked before submission.
   */
  async signIn(user: TestUser): Promise<void> {
    await this.fullNameInput.fill(user.fullName);
    await this.emailInput.fill(user.email);
    if (user.isClubMember) {
      await this.clubCheckbox.check();
    }
    await this.submitButton.click();
    // After submission, the profile card replaces the sign-in form.
    await expect(this.infoCard).toBeVisible();
  }

  /** Toggle club membership for the currently signed-in user. */
  async toggleClubMembership(): Promise<void> {
    await this.toggleClubButton.click();
  }

  async signOut(): Promise<void> {
    await this.signOutButton.click();
    await expect(this.signinCard).toBeVisible();
  }

  // ─── Assertions ──────────────────────────────────────────────────────

  async expectSignedIn(user: TestUser): Promise<void> {
    await expect(this.profileFullName).toHaveText(user.fullName);
    await expect(this.profileEmail).toHaveText(user.email);
  }

  async expectClubMember(): Promise<void> {
    await expect(this.clubStatus).toHaveText("Member");
  }

  async expectNotClubMember(): Promise<void> {
    await expect(this.clubStatus).toHaveText("Not a member");
  }

  async expectOrderInHistory(orderId: string): Promise<void> {
    await expect(this.page.getByTestId(`account-order-${orderId}`)).toBeVisible();
  }
}
