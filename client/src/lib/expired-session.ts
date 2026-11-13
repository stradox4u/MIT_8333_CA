import { watch, type Ref } from "vue";
import { useAuthNavigation } from "../auth/navigation";
import { ApiError } from "./api";

/** Whether a request failed because the session has ended. */
export const isExpiredSession = (error: unknown) =>
  error instanceof ApiError && error.status === 401;

/** A failure the page should offer to retry: anything but an ended session. */
export const isLoadFailure = (error: unknown) =>
  !!error && !isExpiredSession(error);

/** A read that answers 401 ends the session the usual way: back to Sign in. */
export function useExpiredSession(error: Ref<unknown>) {
  const navigation = useAuthNavigation();
  watch(error, async (failure) => {
    if (isExpiredSession(failure)) await navigation.expire();
  });
}
