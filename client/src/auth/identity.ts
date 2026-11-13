import { queryOptions } from "@tanstack/vue-query";
import { api, ApiError } from "../lib/api";

export type Role =
  "student" | "staff" | "maintenance_officer" | "administrator";
export interface User {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  role: Role | null;
  signUpComplete: boolean;
  hasPassword: boolean;
}

export const meKey = ["auth", "me"] as const;
export const meOptions = queryOptions({
  queryKey: meKey,
  queryFn: async ({ signal }): Promise<User | null> => {
    try {
      const user = await api<User>("/auth/me", { signal });
      if (
        !user ||
        typeof user.id !== "string" ||
        typeof user.signUpComplete !== "boolean"
      )
        throw new Error("Invalid identity response");
      return user;
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) return null;
      throw error;
    }
  },
  staleTime: 5_000,
  retry: false,
  refetchOnMount: false,
  refetchOnWindowFocus: false,
  refetchOnReconnect: false,
});
