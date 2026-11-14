<script setup lang="ts">
import { computed, nextTick, ref, watch } from "vue";
import { useRouter } from "vue-router";
import { useQuery, useQueryClient } from "@tanstack/vue-query";
import ArrowLeft from "~icons/lucide/arrow-left";
import ShieldAlert from "~icons/lucide/shield-alert";
import WorkspaceLayout from "../layouts/WorkspaceLayout.vue";
import TextField from "../components/TextField.vue";
import SubmitButton from "../components/SubmitButton.vue";
import StatusChip from "../components/StatusChip.vue";
import { ApiError } from "../lib/api";
import { lengthRule, useFields } from "../lib/fields";
import { useAuthNavigation } from "../auth/navigation";
import { isExpiredSession, useExpiredSession } from "../lib/expired-session";
import RefreshCw from "~icons/lucide/refresh-cw";
import { useScreenMutation } from "../lib/screen-mutation";
import { useUiStore } from "../stores/ui";
import { meOptions } from "../auth/identity";
import LoadFailure from "../components/LoadFailure.vue";
import {
  requestCategoriesOptions,
  serviceRequestOptions,
  editRequest,
  submitServiceRequest,
  type NewServiceRequest,
} from "../service-requests/api";
import { categoryIcon } from "../service-requests/display";

const props = defineProps<{ reference?: string }>();
const editing = !!props.reference;
const router = useRouter();
const navigation = useAuthNavigation();
const queryClient = useQueryClient();
const ui = useUiStore();
const me = useQuery(meOptions);
const source = useQuery(
  computed(() => ({
    ...serviceRequestOptions(props.reference ?? ""),
    enabled: editing,
  })),
);
useExpiredSession(source.error);
const allowed = computed(
  () =>
    source.data.value?.status === "submitted" &&
    source.data.value?.requester.id === me.data.value?.id,
);
const editRefusal = ref("");
const categories = useQuery(requestCategoriesOptions);
useExpiredSession(categories.error);
/** A failure other than an ended session, which goes to Sign in instead. */
const categoriesFailed = computed(
  () => !!categories.error.value && !isExpiredSession(categories.error.value),
);
const form = useFields(
  { title: "", categoryId: "", location: "", description: "" },
  {
    title: lengthRule("a title", 3, 120),
    categoryId: (value) => (value ? "" : "Choose a Request Category."),
    location: lengthRule("where the fault is", 2, 200),
    description: lengthRule("a description of the fault", 10, 5000),
  },
);
let initialized = false;
watch(
  source.data,
  (request) => {
    if (!request || initialized) return;
    Object.assign(form.values, {
      title: request.title,
      categoryId: request.category.id,
      location: request.location,
      description: request.description,
    });
    initialized = true;
  },
  { immediate: true },
);

/** Leaving the group, not moving between its radios, counts as a blur. */
function leaveCategories(event: FocusEvent) {
  const group = event.currentTarget as HTMLElement;
  if (!group.contains(event.relatedTarget as Node | null))
    form.blur("categoryId");
}
const categoryDescribedBy = () =>
  [form.errors.categoryId ? "category-error" : "", "category-hint"]
    .filter(Boolean)
    .join(" ");

const formElement = ref<HTMLFormElement | null>(null);
/** Moves to the first field with an error, once it shows. */
async function focusFirstError() {
  await nextTick();
  formElement.value
    ?.querySelector<HTMLElement>(
      "input[aria-invalid='true'], textarea[aria-invalid='true']",
    )
    ?.focus();
}

const send = useScreenMutation({
  mutationFn: async (report: NewServiceRequest) => {
    if (!editing) {
      const submitted = await submitServiceRequest(report);
      void queryClient.invalidateQueries({ queryKey: ["service-requests"] });
      void queryClient.invalidateQueries({
        queryKey: ["service-requests-summary"],
      });
      return submitted;
    }
    const details = await editRequest(props.reference!, report);
    queryClient.setQueryData(
      serviceRequestOptions(details.reference).queryKey,
      details,
    );
    void queryClient.invalidateQueries({ queryKey: ["service-requests"] });
    void queryClient.invalidateQueries({
      queryKey: ["service-requests-summary"],
    });
    return { reference: details.reference };
  },
  onSuccess: async ({ reference }) => {
    if (editing) ui.editedReference = reference;
    else ui.submittedReference = reference;
    await queryClient.invalidateQueries({ queryKey: ["service-requests"] });
    await queryClient.invalidateQueries({
      queryKey: ["service-requests-summary"],
    });
    await router.push(`/requests/${encodeURIComponent(reference)}`);
  },
  onError: async (error) => {
    if (isExpiredSession(error)) return navigation.expire();
    form.showError(error);
    if (editing && error instanceof ApiError && error.status === 404)
      await queryClient.invalidateQueries({
        queryKey: serviceRequestOptions(props.reference!).queryKey,
      });
    if (
      editing &&
      error instanceof ApiError &&
      [403, 409].includes(error.status)
    ) {
      editRefusal.value =
        "This request changed while you were editing. We’ve refreshed its Status and your permissions.";
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: serviceRequestOptions(props.reference!).queryKey,
        }),
        queryClient.invalidateQueries({ queryKey: meOptions.queryKey }),
      ]);
    }
    if (form.errors.categoryId) {
      form.errors.categoryId =
        "That Request Category isn’t available any more. Choose another.";
      void queryClient.invalidateQueries({
        queryKey: requestCategoriesOptions.queryKey,
      });
    }
    if (!(error instanceof ApiError))
      form.formError.value += " Your details are still here.";
    await focusFirstError();
  },
});

function submit() {
  if (send.isPending.value || (editing && !allowed.value)) return;
  if (!form.validate()) return void focusFirstError();
  send.mutate({
    title: form.values.title.trim(),
    categoryId: form.values.categoryId,
    location: form.values.location.trim(),
    description: form.values.description.trim(),
  });
}
</script>
<template>
  <WorkspaceLayout width="narrow">
    <RouterLink
      :to="
        editing ? `/requests/${encodeURIComponent(reference!)}` : '/requests'
      "
      class="inline-flex items-center gap-1.5 min-h-9 mb-2.5 text-campus-navy text-[12px] underline-offset-4"
      ><ArrowLeft
        class="icon inline-block w-4 h-4 flex-none align-[-3px]"
        aria-hidden="true"
      />{{ editing ? `Back to ${reference}` : "My requests" }}</RouterLink
    >
    <p
      v-if="editRefusal"
      class="mb-4.5 p-3 border border-campus-navy rounded-lg text-[12px]"
      role="alert"
    >
      {{ editRefusal }}
    </p>
    <p
      v-if="editing && source.isPending.value"
      class="text-campus-muted text-[12px]"
      role="status"
    >
      Loading request details…
    </p>
    <section
      v-else-if="editing && source.error.value"
      class="p-6 border border-campus-gray rounded-[13px] bg-campus-surface"
    >
      <h1
        v-if="
          source.error.value instanceof ApiError &&
          [400, 404].includes(source.error.value.status)
        "
      >
        We can’t find {{ reference }}
      </h1>
      <LoadFailure
        v-else
        title="We couldn’t load the request"
        :level="1"
        :pending="source.isFetching.value"
        @retry="source.refetch()"
      />
    </section>
    <section
      v-else-if="editing && !allowed"
      class="p-6 border border-campus-gray rounded-[13px] bg-campus-surface"
    >
      <h1>These details can’t be edited</h1>
      <p class="text-[13px] leading-[1.7]">
        Only the Requester can edit all details while the request is Submitted.
        Administrators can correct category and location on the tracking page
        while it is Open.
      </p>
    </section>
    <template v-else>
      <div class="flex flex-wrap items-end justify-between gap-4.5 mb-5.5">
        <div class="min-w-0">
          <p
            class="mt-0 mx-0 text-[10px] font-semibold tracking-[0.16em] uppercase mb-3"
          >
            {{ editing ? `${reference} · Submitted` : "New Service Request" }}
          </p>
          <h1 class="mb-2.5" id="form-title">
            {{ editing ? "Edit details" : "Report a fault" }}
          </h1>
          <p
            class="intro text-[13px] leading-[1.7] text-campus-muted wrap-anywhere m-0"
          >
            {{
              editing
                ? "You can change these until an Administrator assigns a Maintenance Officer. The Reference stays the same."
                : "Tell us what’s wrong and where it is. An Administrator will assign a Maintenance Officer to fix it."
            }}
          </p>
        </div>
      </div>
      <div
        class="grid grid-cols-[minmax(0,1fr)_270px] items-start gap-5 tablet:grid-cols-[minmax(0,1fr)]"
      >
        <form
          ref="formElement"
          class="mb-4.5 border border-campus-gray rounded-[13px] bg-campus-surface shadow-none grid gap-5.5 p-6.5 phone:py-4.75 phone:px-3.75 phone:gap-5"
          novalidate
          aria-labelledby="form-title"
          @submit.prevent="submit"
        >
          <div
            id="privacy-hint"
            class="flex items-start gap-2.75 py-3 px-3.5 rounded-[9px] bg-campus-panel text-[12px] leading-[1.6]"
          >
            <ShieldAlert
              class="icon inline-block flex-none align-[-3px] w-4.5 h-4.5 mt-px"
              aria-hidden="true"
            />
            <div>
              <strong class="block text-[13px]"
                >Don’t include personal details</strong
              >Leave out names, phone numbers and matriculation numbers. Your
              request stays on record.
            </div>
          </div>
          <TextField
            v-model="form.values.title"
            label="Title"
            name="title"
            :max="120"
            :error="form.errors.title"
            hint="A short summary, such as “Leaking pipe under the sink”. 3–120 characters."
            @blur="form.blur('title')"
            @update:model-value="form.changed('title')"
          />
          <fieldset
            class="grid gap-2 min-w-0 m-0 p-0 border-0 [&[aria-invalid='true']_.category-choice]:border-error"
            :aria-invalid="form.errors.categoryId ? true : undefined"
            @focusout="leaveCategories"
          >
            <legend class="mb-2 p-0 text-[12px] font-semibold">
              Request Category
            </legend>
            <p
              v-if="categories.isPending.value"
              class="m-0 text-campus-muted text-[11px] leading-[1.65]"
              role="status"
            >
              Loading the Request Categories…
            </p>
            <div
              v-else-if="categoriesFailed"
              class="grid justify-items-start gap-2.5"
            >
              <p
                class="field-error text-error text-[11px] leading-[1.65] m-0"
                role="alert"
              >
                We couldn’t load the Request Categories. Check your connection
                and try again.
              </p>
              <SubmitButton
                compact
                type="button"
                variant="outline"
                class="compact-button has-request"
                :pending="categories.isFetching.value"
                @click="categories.refetch()"
                ><RefreshCw
                  class="icon inline-block w-4 h-4 flex-none align-[-3px]"
                  aria-hidden="true"
                />Try again</SubmitButton
              >
            </div>
            <div v-else class="grid grid-cols-3 gap-2.5 phone:grid-cols-2">
              <label
                v-for="category in categories.data.value"
                :key="category.id"
                class="category-choice flex items-center gap-2.25 min-h-13 py-2.5 px-2.75 border border-campus-control rounded-lg bg-campus-surface text-[12px] font-[550] [&:has(input:checked)]:border-campus-navy [&:has(input:checked)]:bg-campus-green [&:has(input:checked)]:shadow-[0_0_0_1px_var(--color-campus-navy)_inset] [&:has(input:focus-visible)]:outline-[3px] [&:has(input:focus-visible)]:outline-solid [&:has(input:focus-visible)]:outline-campus-navy [&:has(input:focus-visible)]:outline-offset-[3px] [&_input:focus-visible]:outline-none"
                ><input
                  class="w-4 h-4 flex-none m-0 accent-campus-navy"
                  v-model="form.values.categoryId"
                  type="radio"
                  name="categoryId"
                  :value="category.id"
                  :aria-invalid="form.errors.categoryId ? true : undefined"
                  :aria-describedby="categoryDescribedBy()"
                  @change="form.blur('categoryId')"
                /><component
                  :is="categoryIcon(category.id)"
                  class="icon inline-block flex-none align-[-3px] w-4.25 h-4.25"
                  aria-hidden="true"
                /><span>{{ category.name }}</span></label
              >
            </div>
            <p
              v-if="form.errors.categoryId"
              id="category-error"
              class="field-error mt-1.25 mx-0 mb-0 text-error text-[11px] leading-[1.65]"
              aria-live="polite"
            >
              {{ form.errors.categoryId }}
            </p>
            <p
              id="category-hint"
              class="m-0 text-campus-muted text-[11px] leading-[1.65]"
            >
              The type of fault. Where it is goes in Location.
            </p>
          </fieldset>
          <TextField
            v-model="form.values.location"
            label="Location"
            name="location"
            placeholder="Hostel B, room 214"
            :max="200"
            :error="form.errors.location"
            hint="The building, then the room or area. 2–200 characters."
            @blur="form.blur('location')"
            @update:model-value="form.changed('location')"
          />
          <TextField
            v-model="form.values.description"
            label="Description"
            name="description"
            multiline
            :max="5000"
            :error="form.errors.description"
            hint="What’s wrong, since when, and anything the officer should know, such as when the room is open. 10–5,000 characters."
            described-by="privacy-hint"
            @blur="form.blur('description')"
            @update:model-value="form.changed('description')"
          />
          <div>
            <div
              class="flex flex-wrap items-center gap-y-2.5 gap-x-4 phone:[&_.button]:w-full"
            >
              <SubmitButton
                compact
                class="compact-button has-request"
                :pending="send.isPending.value"
                >{{
                  editing ? "Save changes" : "Submit Service Request"
                }}</SubmitButton
              >
            </div>
            <p
              v-if="form.formError.value"
              class="field-error text-error text-[11px] leading-[1.65] mt-2.5 mx-0 mb-0"
              role="alert"
            >
              {{ form.formError.value }}
            </p>
          </div>
        </form>
        <aside
          class="mb-4.5 border border-campus-gray p-6 rounded-[13px] bg-campus-surface shadow-none phone:py-4.75 phone:px-3.75 sticky top-7 [&_h2]:mb-3.5 tablet:static"
          aria-labelledby="next-title"
        >
          <h2 id="next-title">What happens next</h2>
          <ol
            class="grid gap-3.5 m-0 p-0 list-none [&_li]:grid [&_li]:grid-cols-[auto_1fr] [&_li]:items-start [&_li]:gap-y-1 [&_li]:gap-x-2.5 [&_li]:text-campus-muted [&_li]:text-[12px] [&_li]:leading-[1.55]"
          >
            <li>
              <StatusChip status="submitted" />
              <p class="col-span-full m-0">
                An Administrator gives it an Assignment to a Maintenance
                Officer.
              </p>
            </li>
            <li>
              <StatusChip status="in_progress" />
              <p class="col-span-full m-0">The officer works on it.</p>
            </li>
            <li>
              <StatusChip status="completed" />
              <p class="col-span-full m-0">
                You tell us whether it’s fixed. If you don’t answer within 7
                days, it becomes Verified.
              </p>
            </li>
          </ol>
          <p class="m-0 text-campus-muted text-[11px] leading-[1.65] mt-4">
            Quote your Reference, such as SR-PLUMB-42, if you contact the
            maintenance team.
          </p>
        </aside>
      </div>
    </template>
  </WorkspaceLayout>
</template>
