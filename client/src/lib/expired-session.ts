import { watch, type Ref } from "vue";
import { useAuthNavigation } from "../auth/navigation";
import { ApiError } from "./api";

/** A read that answers 401 ends the session the usual way: back to Sign in. */
export function useExpiredSession(error: Ref<unknown>) {
  const navigation = useAuthNavigation();
  watch(error, async (failure) => {
    if (failure instanceof ApiError && failure.status === 401)
      await navigation.expire();
  });
}
