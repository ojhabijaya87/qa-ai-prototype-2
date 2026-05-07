import { Page } from "@playwright/test";

export async function loginAsGuest(page: Page, email: string): Promise<void> {
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Continue as guest" }).click();
}

export function generateTestEmail(): string {
  return `test-${Date.now()}@newlook.test`;
}
