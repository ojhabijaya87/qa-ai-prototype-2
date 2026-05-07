/**
 * Shared types for the Looksy test framework.
 *
 * These types are imported by POMs, fixtures, and utilities. They give
 * the catalogue extractor something concrete to read — when a POM method
 * accepts a `ProductVariant`, the model knows what shape the test must
 * pass in.
 *
 * In a real framework these would live in a `types/` directory at the
 * package root and be exported from the package entrypoint.
 */

/**
 * A product variant — a specific colour and size combination of a product.
 * Used by POM methods that act on a single SKU.
 */
export interface ProductVariant {
  /** Stable product identifier (e.g. "p-002"). */
  productId: string;
  /** Human-readable slug used in product page URLs. */
  productSlug: string;
  /** Colour identifier from the product's available colours (e.g. "moss"). */
  colorId: string;
  /** Size code — XS, S, M, L, XL, XXL, or ONE for one-size items. */
  size: ProductSize;
}

export type ProductSize = "XS" | "S" | "M" | "L" | "XL" | "XXL" | "ONE";

/**
 * A user account used in tests. The `isClubMember` flag toggles
 * membership-gated behaviour like the CLUB15 promo code.
 */
export interface TestUser {
  fullName: string;
  email: string;
  isClubMember: boolean;
}

/**
 * A delivery address used at checkout. The shape matches the form fields
 * on Looksy's CheckoutPage exactly — keeping the test type aligned with
 * the UI prevents drift.
 */
export interface DeliveryAddress {
  fullName: string;
  line1: string;
  line2?: string;
  city: string;
  /** UK postcode format. The page validates with a regex. */
  postcode: string;
  country: string;
  phone: string;
}

/**
 * Card payment details. CVC is intentionally typed as string because
 * leading zeros matter and we never want to lose them.
 */
export interface CardDetails {
  number: string;
  /** Format: MM/YY (the page auto-formats input to this shape). */
  expiry: string;
  cvc: string;
}

/**
 * The three payment methods Looksy currently supports.
 */
export type PaymentMethod = "card" | "klarna" | "paypal";

/**
 * The three shipping methods Looksy currently supports.
 */
export type ShippingMethod = "standard" | "express" | "next-day";

/**
 * A promo code as the test framework knows it. The `expectedReason` field
 * is used in negative tests where we expect a specific rejection.
 */
export interface PromoCode {
  code: string;
  description: string;
}

export type PromoRejectionReason =
  | "invalid"
  | "min-spend"
  | "club-only"
  | "already-applied";

/**
 * Categories on Looksy — used for catalogue filter tests.
 */
export type ProductCategory =
  | "outerwear"
  | "knitwear"
  | "tops"
  | "bottoms"
  | "footwear"
  | "accessories";
