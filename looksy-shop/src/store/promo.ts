import { create } from "zustand";
import type { PromoCode, Toast, ToastVariant } from "@/types";
import { PROMO_CODES } from "@/data/products";

interface PromoState {
  applied: PromoCode | null;
  apply: (code: string, opts: { isClubMember: boolean; subtotal: number }) => ApplyResult;
  remove: () => void;
}

export interface ApplyResult {
  ok: boolean;
  reason?: "invalid" | "min-spend" | "club-only" | "already-applied";
}

export const usePromo = create<PromoState>((set, get) => ({
  applied: null,
  apply: (code, { isClubMember, subtotal }) => {
    if (get().applied) return { ok: false, reason: "already-applied" };
    const promo = PROMO_CODES.find((p) => p.code.toLowerCase() === code.trim().toLowerCase());
    if (!promo) return { ok: false, reason: "invalid" };
    if (promo.code === "CLUB15" && !isClubMember) return { ok: false, reason: "club-only" };
    if (promo.minSpend && subtotal < promo.minSpend) return { ok: false, reason: "min-spend" };
    set({ applied: promo });
    return { ok: true };
  },
  remove: () => set({ applied: null }),
}));

interface ToastState {
  toasts: Toast[];
  push: (message: string, variant?: ToastVariant) => void;
  dismiss: (id: string) => void;
}

export const useToasts = create<ToastState>((set) => ({
  toasts: [],
  push: (message, variant = "info") => {
    const id = `t-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const toast: Toast = { id, message, variant, createdAt: Date.now() };
    set((state) => ({ toasts: [...state.toasts, toast] }));
    // Auto-dismiss after 4 seconds
    setTimeout(() => {
      set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) }));
    }, 4000);
  },
  dismiss: (id) =>
    set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) })),
}));
