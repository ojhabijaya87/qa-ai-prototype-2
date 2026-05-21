/**
 * Test data factories.
 *
 * These functions produce valid-by-default data for tests. Tests should
 * NOT hardcode emails, postcodes, card numbers — they should call these
 * factories and override only the fields they care about for the scenario.
 *
 * Why factories? Two reasons:
 *   1. Determinism. Timestamps in emails make every run unique without
 *      requiring the test to deal with cleanup.
 *   2. Validity. Postcodes follow the UK regex. Card numbers pass Luhn
 *      length checks. Mistakes here become test flake; doing it once
 *      and well removes a class of failures.
 */

import type {
  TestUser,
  DeliveryAddress,
  CardDetails,
  ProductVariant,
} from "../types/index.js";

/**
 * Generate a unique test email. The timestamp makes it unique per run,
 * the suffix makes it filterable if test data ever leaks to production.
 */
export function generateTestEmail(prefix = "qa"): string {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1000)}@looksy.test`;
}

/**
 * Build a default test user. Pass overrides for fields you care about.
 *
 * @example
 *   const user = buildTestUser();                              // guest-style
 *   const member = buildTestUser({ isClubMember: true });      // club member
 *   const named = buildTestUser({ fullName: "Bijay Sharma" }); // specific name
 */
export function buildTestUser(overrides: Partial<TestUser> = {}): TestUser {
  return {
    fullName: "Test User",
    email: generateTestEmail(),
    isClubMember: false,
    ...overrides,
  };
}

/**
 * Default UK delivery address. Postcode is a real, valid format that
 * passes Looksy's regex validator.
 */
export function buildDeliveryAddress(
  overrides: Partial<DeliveryAddress> = {}
): DeliveryAddress {
  return {
    fullName: "Test User",
    line1: "221B Baker Street",
    line2: undefined,
    city: "London",
    postcode: "NW1 6XE",
    country: "United Kingdom",
    phone: "07700 900000",
    ...overrides,
  };
}

/**
 * Test card details. The card number is the standard Stripe test card.
 * In a real framework this would come from a vault; for test target
 * Looksy there's no real payment processor so any 16 digits work.
 */
export function buildCardDetails(overrides: Partial<CardDetails> = {}): CardDetails {
  return {
    number: "4242 4242 4242 4242",
    expiry: "12/30",
    cvc: "123",
    ...overrides,
  };
}

/**
 * Common product variants used across tests. Picking these out into
 * named constants keeps tests readable — `KNIT_MOSS_M` reads better
 * than an inline object literal, and if Looksy renames a colour the
 * fix is in one place.
 */
export const VARIANTS = {
  /** Fennel Fisherman Knit, moss colour, size M. Stock: 0 (out of stock). */
  KNIT_MOSS_M: {
    productId: "p-002",
    productSlug: "fennel-fisherman-knit",
    colorId: "moss",
    size: "M",
  } as ProductVariant,

  /** Fennel Fisherman Knit, bone colour, size M. Stock: 6 (plenty). */
  KNIT_BONE_M: {
    productId: "p-002",
    productSlug: "fennel-fisherman-knit",
    colorId: "bone",
    size: "M",
  } as ProductVariant,
ASHFORD_OVERCOAT_INK_S: {
  productId: "p-001",
  productSlug: "ashford-overcoat",
  colorId: "ink",
  size: "S",
} as ProductVariant,
  /** Linden Relaxed Tee, ink colour, size M. Stock: 15 (high). */
  TEE_INK_M: {
    productId: "p-004",
    productSlug: "linden-relaxed-tee",
    colorId: "ink",
    size: "M",
  } as ProductVariant,

  /** Selvedge Straight Jean, storm colour, size L. On sale. */
  JEAN_STORM_L: {
    productId: "p-006",
    productSlug: "selvedge-straight-jean",
    colorId: "storm",
    size: "L",
  } as ProductVariant,

KNIT_BONE_S: {
  productId: "p-002",
  productSlug: "fennel-fisherman-knit",
  colorId: "bone",
  size: "S",
} as ProductVariant,

  /**
   * North Leather Boot, ink colour, size M. Stock: 0 across ALL variants.
   * Use this when a test needs the "completely sold out" UI path.
   */
  BOOT_INK_M_SOLD_OUT: {
    productId: "p-016",
    productSlug: "north-leather-boot",
    colorId: "ink",
    size: "M",
  } as ProductVariant,
} as const;

/**
 * Promo codes recognised by Looksy. Useful for promo-related tests.
 * Mirroring these here means the AI generator sees valid codes in the
 * catalogue and uses them rather than inventing new ones.
 */
export const PROMO_CODES = {
  /** 10% off, no conditions. */
  WELCOME10: "WELCOME10",
  /** Free shipping on orders >= £50. */
  FREESHIP: "FREESHIP",
  /** £25 off when spending £150+. */
  ATELIER25: "ATELIER25",
  /** 15% off, club members only. */
  CLUB15: "CLUB15",
} as const;
