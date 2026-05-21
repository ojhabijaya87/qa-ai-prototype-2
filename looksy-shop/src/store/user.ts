import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { User } from "@/types";

interface UserState {
  user: User | null;
  signIn: (email: string, fullName: string, isClubMember: boolean) => void;
  signOut: () => void;
}

export const useUser = create<UserState>()(
  persist(
    (set) => ({
      user: null,
      signIn: (email, fullName, isClubMember) =>
        set({ user: { email, fullName, isClubMember } }),
      signOut: () => set({ user: null }),
    }),
    { name: "looksy-user" }
  )
);
