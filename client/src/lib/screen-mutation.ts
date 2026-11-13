import { onBeforeUnmount, watch } from "vue";
import { useRoute } from "vue-router";
import { useMutation } from "@tanstack/vue-query";

export interface ScreenActivity {
  isCurrent: () => boolean;
}
interface ScreenMutation<TData, TVariables> {
  mutationFn: (
    variables: TVariables,
    activity: ScreenActivity,
  ) => Promise<TData>;
  onMutate?: (variables: TVariables) => void;
  onSuccess?: (data: TData, variables: TVariables) => void | Promise<void>;
  onError?: (error: Error, variables: TVariables) => void | Promise<void>;
}

/** A departed screen cannot use a late response to change the active journey. */
export function useScreenMutation<TData, TVariables = void>(
  options: ScreenMutation<TData, TVariables>,
) {
  const route = useRoute();
  let active = true;
  let revision = 0;
  let submittedRevision = 0;
  watch(
    () => route.fullPath,
    () => {
      revision++;
    },
    { flush: "sync" },
  );
  onBeforeUnmount(() => {
    active = false;
  });
  const isCurrent = () => active && submittedRevision === revision;
  return useMutation<TData, Error, TVariables>({
    mutationFn: (variables) => options.mutationFn(variables, { isCurrent }),
    onMutate: (variables) => {
      submittedRevision = revision;
      options.onMutate?.(variables);
    },
    onSuccess: (data, variables) => {
      if (isCurrent()) return options.onSuccess?.(data, variables);
    },
    onError: (error, variables) => {
      if (isCurrent()) return options.onError?.(error, variables);
    },
  });
}
