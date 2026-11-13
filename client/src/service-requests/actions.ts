import { useQueryClient } from "@tanstack/vue-query";
import { useAuthNavigation } from "../auth/navigation";
import { meOptions } from "../auth/identity";
import { ApiError, errorMessage } from "../lib/api";
import { isExpiredSession } from "../lib/expired-session";
import { useScreenMutation } from "../lib/screen-mutation";
import {
  maintenanceOfficersOptions,
  serviceRequestOptions,
  type ServiceRequestDetails,
} from "./api";

export type Report = (message: string, kind?: "success" | "error") => void;

/**
 * An action on the tracking page. Success shows the API's new details at once;
 * a refusal refreshes the request and says why, so the page shows what changed.
 */
export function useRequestAction<Variables>(options: {
  reference: () => string;
  run: (variables: Variables) => Promise<ServiceRequestDetails>;
  done: (details: ServiceRequestDetails, variables: Variables) => string;
  report: Report;
  validationError?: (error: ApiError) => void;
  requestError?: (error: Error) => void;
  forbidden?: string;
  onDone?: () => void;
}) {
  const queryClient = useQueryClient();
  const navigation = useAuthNavigation();
  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({
        queryKey: serviceRequestOptions(options.reference()).queryKey,
      }),
      queryClient.invalidateQueries({ queryKey: ["service-requests"] }),
      queryClient.invalidateQueries({
        queryKey: maintenanceOfficersOptions.queryKey,
      }),
    ]);
  return useScreenMutation({
    // The cache takes the answer even if the page has gone by then.
    mutationFn: async (variables: Variables, activity) => {
      const details = await options.run(variables);
      // Cache changes can remove the action component before onSuccess runs.
      if (activity.isCurrent()) {
        options.report(options.done(details, variables));
        options.onDone?.();
      }
      queryClient.setQueryData(
        serviceRequestOptions(details.reference).queryKey,
        details,
      );
      void queryClient.invalidateQueries({ queryKey: ["service-requests"] });
      void queryClient.invalidateQueries({
        queryKey: maintenanceOfficersOptions.queryKey,
      });
      return details;
    },
    onError: async (error) => {
      if (isExpiredSession(error)) return navigation.expire();
      if (
        error instanceof ApiError &&
        error.status === 400 &&
        options.validationError
      )
        return options.validationError(error);
      const reference = options.reference();
      if (error instanceof ApiError && error.status === 409)
        options.report(
          `${reference} changed while you had it open. We’ve refreshed it, so check its Status before trying again.`,
          "error",
        );
      else if (error instanceof ApiError && error.status === 403)
        options.report(
          options.forbidden ??
            `You’re no longer assigned to ${reference}, so you can’t do that.`,
          "error",
        );
      else if (!(error instanceof ApiError && error.status === 404))
        return options.requestError
          ? options.requestError(error)
          : options.report(errorMessage(error), "error");
      // 404: the refreshed page says it can't be found.
      if (error instanceof ApiError && error.status === 403)
        await queryClient.invalidateQueries({ queryKey: meOptions.queryKey });
      await refresh();
    },
  });
}
