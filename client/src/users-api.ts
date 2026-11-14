import { queryOptions, useQueryClient } from "@tanstack/vue-query";
import { api, ApiError, errorMessage } from "./lib/api";
import { useScreenMutation } from "./lib/screen-mutation";
import { useAuthNavigation } from "./auth/navigation";
import { meOptions, type User } from "./auth/identity";
import { isExpiredSession } from "./lib/expired-session";

export const roles = {
  student: "Student",
  staff: "Staff",
  maintenance_officer: "Maintenance Officer",
  administrator: "Administrator",
} as const;
export type Role = keyof typeof roles;
export interface ManagedUser {
  id: string;
  name: string;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  role: Role;
  status: "invited" | "active" | "deactivated" | "erased";
  createdAt: string;
}
export const usersOptions = queryOptions({
  queryKey: ["users"],
  queryFn: () => api<ManagedUser[]>("/users"),
});

/** Successful management writes refresh lists even after leaving the panel. */
export function useUserAction<T>(options: {
  run: (value: T) => Promise<unknown>;
  done: (value: T) => void;
  error: (error: unknown) => void;
}) {
  const client = useQueryClient();
  const navigation = useAuthNavigation();
  let actorId: string | undefined;
  const sameActor = () =>
    client.getQueryData<User>(meOptions.queryKey)?.id === actorId;
  return useScreenMutation({
    mutationFn: async (value: T, activity) => {
      actorId = client.getQueryData<User>(meOptions.queryKey)?.id;
      await options.run(value);
      await Promise.all(
        [
          "users",
          "service-requests",
          "service-requests-summary",
          "maintenance-officers",
          "service-request",
        ].map((key) => client.invalidateQueries({ queryKey: [key] })),
      );
      if (activity.isCurrent() && sameActor()) options.done(value);
    },
    onError: async (error, _value, activity) => {
      if (!sameActor()) return;
      if (isExpiredSession(error)) return navigation.expire();
      if (error instanceof ApiError && error.status === 403) {
        await client.invalidateQueries({ queryKey: meOptions.queryKey });
        try {
          await navigation.retryIdentity(
            () => activity.isCurrent() && sameActor(),
          );
        } catch (failure) {
          if (activity.isCurrent() && sameActor()) options.error(failure);
          return;
        }
        if (!activity.isCurrent() || !sameActor()) return;
      }
      options.error(error);
      if (error instanceof ApiError && [404, 409].includes(error.status))
        void client.invalidateQueries({ queryKey: usersOptions.queryKey });
    },
  });
}
export { api, errorMessage };
