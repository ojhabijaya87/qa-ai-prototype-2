/**
 * Authenticated test fixtures.
 *
 * Some tests need a user already signed in before the test body runs.
 * Rather than have every such test repeat the sign-in steps, the
 * authenticated fixtures handle it via a `beforeEach` baked into the
 * fixture resolution.
 *
 * Two flavours:
 *   - authenticatedTest: a regular signed-in user (not a club member)
 *   - clubMemberTest:    a signed-in Looksy Club member (unlocks CLUB15)
 *
 * Both extend the base looksy fixture, so all POMs are still available.
 */

import { test as baseLooksyTest } from "./looksy.fixture.js";
import { buildTestUser } from "../test-data/factories.js";
import type { TestUser } from "../types/index.js";

type AuthenticatedFixtures = {
  user: TestUser;
};

/**
 * A test that runs with a regular signed-in user. The user is created
 * fresh per test (unique email via timestamp) so tests can't cross-
 * contaminate.
 *
 * @example
 *   authenticatedTest("renames profile @web @account @priority-medium",
 *     async ({ accountPage, user }) => {
 *       await accountPage.expectSignedIn(user);
 *     });
 */
export const authenticatedTest = baseLooksyTest.extend<AuthenticatedFixtures>({
  user: async ({ accountPage }, use) => {
    const u = buildTestUser({ isClubMember: false });
    await accountPage.goto();
    await accountPage.signIn(u);
    await use(u);
  },
});

/**
 * A test that runs with a signed-in Looksy Club member. Use this for
 * any test exercising club-only features (CLUB15 promo, member-gated
 * UI, club banner messaging).
 */
export const clubMemberTest = baseLooksyTest.extend<AuthenticatedFixtures>({
  user: async ({ accountPage }, use) => {
    const u = buildTestUser({ isClubMember: true });
    await accountPage.goto();
    await accountPage.signIn(u);
    await use(u);
  },
});

export { expect } from "@playwright/test";
