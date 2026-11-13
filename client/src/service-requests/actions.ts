import { useQueryClient } from "@tanstack/vue-query";
import { useAuthNavigation } from "../auth/navigation";
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
    mutationFn: async (variables: Variables) => {
      const details = await options.run(variables);
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
    onSuccess: async (details, variables) => {
      options.report(options.done(details, variables));
    },
    onError: async (error) => {
      if (isExpiredSession(error)) return navigation.expire();
      const reference = options.reference();
      if (error instanceof ApiError && error.status === 409)
        options.report(
          `${reference} changed while you had it open. We’ve refreshed it, so check its Status before trying again.`,
          "error",
        );
      else if (error instanceof ApiError && error.status === 403)
        options.report(
          `You’re no longer assigned to ${reference}, so you can’t do that.`,
          "error",
        );
      else if (!(error instanceof ApiError && error.status === 404))
        return options.report(errorMessage(error), "error");
      // 404: the refreshed page says it can't be found.
      await refresh();
    },
  });
}
