import type { CartItem, PromoCode, ShippingMethod } from "@/types";
import { PRODUCTS } from "@/data/products";

export function formatGBP(pence: number): string {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
  }).format(pence / 100);
}

export interface TotalsBreakdown {
  subtotal: number;
  discount: number;
  shipping: number;
  total: number;
  freeShippingApplied: boolean;
}

export function calculateTotals(
  items: CartItem[],
  promo: PromoCode | null,
  shipping: ShippingMethod | null
): TotalsBreakdown {
  const subtotal = items.reduce((sum, item) => {
    const product = PRODUCTS.find((p) => p.id === item.productId);
    return product ? sum + product.price * item.quantity : sum;
  }, 0);

  let discount = 0;
  let freeShippingApplied = false;

  if (promo) {
    if (promo.type === "percent") {
      discount = Math.floor(subtotal * (promo.value / 100));
    } else if (promo.type === "fixed") {
      discount = promo.value;
    } else if (promo.type === "shipping") {
      freeShippingApplied = true;
    }
  }

  const shippingCost = freeShippingApplied ? 0 : shipping?.price ?? 0;
  const total = Math.max(0, subtotal - discount) + shippingCost;

  return {
    subtotal,
    discount,
    shipping: shippingCost,
    total,
    freeShippingApplied,
  };
}

export interface ValidationErrors {
  [field: string]: string | undefined;
}

export function validateEmail(email: string): string | undefined {
  if (!email.trim()) return "Email is required";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return "Enter a valid email address";
  return undefined;
}

export function validateAddress(form: Record<string, string>): ValidationErrors {
  const errors: ValidationErrors = {};
  const required = ["fullName", "line1", "city", "postcode", "country", "phone"];
  for (const field of required) {
    if (!form[field]?.trim()) {
      errors[field] = `${camelCaseToLabel(field)} is required`;
    }
  }
  if (form.postcode && !/^[A-Z]{1,2}[0-9R][0-9A-Z]?\s?[0-9][A-Z]{2}$/i.test(form.postcode.trim())) {
    errors.postcode = "Enter a valid UK postcode (e.g. SW1A 1AA)";
  }
  if (form.phone && !/^[\d\s+()-]{7,}$/.test(form.phone.trim())) {
    errors.phone = "Enter a valid phone number";
  }
  return errors;
}

function camelCaseToLabel(s: string): string {
  return s.replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase());
}

export function generateOrderId(): string {
  const random = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `LK-${Date.now().toString().slice(-6)}-${random}`;
}

export function isVariantInStock(stock: Record<string, number>, colorId: string, size: string): boolean {
  return (stock[`${colorId}:${size}`] ?? 0) > 0;
}

export function isProductCompletelyOutOfStock(stock: Record<string, number>): boolean {
  return Object.values(stock).every((q) => q <= 0);
}
