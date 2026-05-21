import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { CartItem, ProductSize } from "@/types";
import { PRODUCTS } from "@/data/products";

interface CartState {
  items: CartItem[];
  addItem: (productId: string, colorId: string, size: ProductSize, qty?: number) => AddResult;
  updateQuantity: (productId: string, colorId: string, size: ProductSize, qty: number) => void;
  removeItem: (productId: string, colorId: string, size: ProductSize) => void;
  clear: () => void;
  itemCount: () => number;
  subtotal: () => number;
}

export interface AddResult {
  ok: boolean;
  reason?: "out-of-stock" | "exceeds-stock" | "invalid-variant";
  capped?: number;
}

function variantKey(colorId: string, size: ProductSize): string {
  return `${colorId}:${size}`;
}

function getStock(productId: string, colorId: string, size: ProductSize): number {
  const product = PRODUCTS.find((p) => p.id === productId);
  if (!product) return 0;
  return product.stock[variantKey(colorId, size)] ?? 0;
}

export const useCart = create<CartState>()(
  persist(
    (set, get) => ({
      items: [],

      addItem: (productId, colorId, size, qty = 1) => {
        const stock = getStock(productId, colorId, size);
        if (stock <= 0) return { ok: false, reason: "out-of-stock" };

        const existing = get().items.find(
          (i) => i.productId === productId && i.colorId === colorId && i.size === size
        );
        const currentQty = existing?.quantity ?? 0;
        const desired = currentQty + qty;

        if (desired > stock) {
          // Cap at stock and report it.
          if (existing) {
            set((state) => ({
              items: state.items.map((i) =>
                i === existing ? { ...i, quantity: stock } : i
              ),
            }));
          } else {
            set((state) => ({
              items: [
                ...state.items,
                { productId, colorId, size, quantity: stock, addedAt: Date.now() },
              ],
            }));
          }
          return { ok: false, reason: "exceeds-stock", capped: stock };
        }

        if (existing) {
          set((state) => ({
            items: state.items.map((i) =>
              i === existing ? { ...i, quantity: desired } : i
            ),
          }));
        } else {
          set((state) => ({
            items: [
              ...state.items,
              { productId, colorId, size, quantity: qty, addedAt: Date.now() },
            ],
          }));
        }
        return { ok: true };
      },

      updateQuantity: (productId, colorId, size, qty) => {
        if (qty <= 0) {
          get().removeItem(productId, colorId, size);
          return;
        }
        const stock = getStock(productId, colorId, size);
        const capped = Math.min(qty, stock);
        set((state) => ({
          items: state.items.map((i) =>
            i.productId === productId && i.colorId === colorId && i.size === size
              ? { ...i, quantity: capped }
              : i
          ),
        }));
      },

      removeItem: (productId, colorId, size) => {
        set((state) => ({
          items: state.items.filter(
            (i) => !(i.productId === productId && i.colorId === colorId && i.size === size)
          ),
        }));
      },

      clear: () => set({ items: [] }),

      itemCount: () => get().items.reduce((sum, i) => sum + i.quantity, 0),

      subtotal: () => {
        return get().items.reduce((sum, item) => {
          const product = PRODUCTS.find((p) => p.id === item.productId);
          if (!product) return sum;
          return sum + product.price * item.quantity;
        }, 0);
      },
    }),
    {
      name: "looksy-cart",
      version: 1,
    }
  )
);
