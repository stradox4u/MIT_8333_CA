import { computed, ref, watch, type Ref } from "vue";
import { ApiError } from "../lib/api";

interface RequestRead {
  data: Readonly<Ref<unknown>>;
  error: Readonly<Ref<unknown>>;
  refetch: (options?: {
    cancelRefetch?: boolean;
  }) => Promise<{ error: unknown }>;
}

/** Refresh failed signed links once per photo, retaining drafts during transient failures. */
export function usePhotoLinks(
  reference: Readonly<Ref<string>>,
  request: RequestRead,
) {
  const attempted = new Set<string>();
  const requested = ref(false);
  let revision = 0;
  watch(
    reference,
    () => {
      revision++;
      attempted.clear();
      requested.value = false;
    },
    { flush: "sync" },
  );
  const refreshFailed = computed(() => {
    const error = request.error.value;
    return (
      requested.value &&
      !!request.data.value &&
      !!error &&
      (!(error instanceof ApiError) ||
        error.status === 429 ||
        error.status >= 500)
    );
  });
  async function refresh() {
    requested.value = true;
    const currentRevision = revision;
    const result = await request.refetch({ cancelRefetch: false });
    if (currentRevision === revision && !result.error) requested.value = false;
  }
  function failed(photoId: string) {
    if (attempted.has(photoId)) return;
    attempted.add(photoId);
    void refresh();
  }
  return { refreshFailed, refresh, failed };
}
