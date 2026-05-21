export interface Product {
  id: string;
  slug: string;
  name: string;
  brand: string;
  category: ProductCategory;
  description: string;
  price: number; // pence
  comparePrice?: number; // for sale items
  currency: "GBP";
  colors: ProductColor[];
  sizes: ProductSize[];
  stock: Record<string, number>; // key: `${colorId}:${size}` -> qty
  images: string[]; // object-key style identifiers (we'll render as gradients)
  rating: number; // 0-5
  reviewCount: number;
  tags: ProductTag[];
}

export type ProductCategory =
  | "outerwear"
  | "knitwear"
  | "tops"
  | "bottoms"
  | "footwear"
  | "accessories";

export type ProductTag = "new" | "bestseller" | "sale" | "limited" | "sustainable";

export interface ProductColor {
  id: string;
  name: string;
  hex: string;
}

export type ProductSize = "XS" | "S" | "M" | "L" | "XL" | "XXL" | "ONE";

export interface CartItem {
  productId: string;
  colorId: string;
  size: ProductSize;
  quantity: number;
  addedAt: number;
}

export interface PromoCode {
  code: string;
  type: "percent" | "fixed" | "shipping";
  value: number; // percent (0-100), pence, or 0 for free shipping
  minSpend?: number; // pence
  description: string;
}

export interface ShippingMethod {
  id: string;
  name: string;
  price: number; // pence
  estimateDays: [number, number]; // min, max
}

export interface Address {
  fullName: string;
  line1: string;
  line2?: string;
  city: string;
  postcode: string;
  country: string;
  phone: string;
}

export interface PaymentMethod {
  id: "card" | "klarna" | "paypal";
  label: string;
  description: string;
}

export interface Order {
  id: string;
  items: CartItem[];
  subtotal: number;
  discount: number;
  shipping: number;
  total: number;
  currency: "GBP";
  promoCodeUsed?: string;
  shippingMethod: string;
  paymentMethod: string;
  address: Address;
  email: string;
  placedAt: number;
  status: OrderStatus;
}

export type OrderStatus = "pending" | "confirmed" | "shipped" | "delivered" | "cancelled";

export interface User {
  email: string;
  fullName: string;
  isClubMember: boolean;
}

export type ToastVariant = "success" | "error" | "info";

export interface Toast {
  id: string;
  message: string;
  variant: ToastVariant;
  createdAt: number;
}
