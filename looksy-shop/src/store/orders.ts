import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Order } from "@/types";

interface OrderState {
  orders: Order[];
  place: (order: Order) => void;
  getById: (id: string) => Order | undefined;
}

export const useOrders = create<OrderState>()(
  persist(
    (set, get) => ({
      orders: [],
      place: (order) => set((state) => ({ orders: [order, ...state.orders] })),
      getById: (id) => get().orders.find((o) => o.id === id),
    }),
    { name: "looksy-orders" }
  )
);
