<script setup lang="ts">
import { computed, nextTick, ref } from "vue";
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
import {
  isExpiredSession,
  useExpiredSession,
} from "../lib/expired-session";
import RefreshCw from "~icons/lucide/refresh-cw";
import { useScreenMutation } from "../lib/screen-mutation";
import { useUiStore } from "../stores/ui";
import {
  requestCategoriesOptions,
  submitServiceRequest,
  type NewServiceRequest,
} from "../service-requests/api";
import { categoryIcon } from "../service-requests/display";

const router = useRouter();
const navigation = useAuthNavigation();
const queryClient = useQueryClient();
const ui = useUiStore();
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
  mutationFn: (report: NewServiceRequest) => submitServiceRequest(report),
  onSuccess: async ({ reference }) => {
    ui.submittedReference = reference;
    await queryClient.invalidateQueries({ queryKey: ["service-requests"] });
    await router.push(`/requests/${encodeURIComponent(reference)}`);
  },
  onError: async (error) => {
    if (isExpiredSession(error)) return navigation.expire();
    form.showError(error);
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
  if (send.isPending.value) return;
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
    <RouterLink to="/requests" class="back-link"
      ><ArrowLeft class="icon" aria-hidden="true" />My requests</RouterLink
    >
    <div class="page-heading">
      <div>
        <p class="eyebrow">New Service Request</p>
        <h1 id="form-title">Report a fault</h1>
        <p class="intro">
          Tell us what’s wrong and where it is. An Administrator will assign a
          Maintenance Officer to fix it.
        </p>
      </div>
    </div>
    <div class="form-layout">
      <form
        ref="formElement"
        class="settings-section sr-form"
        novalidate
        aria-labelledby="form-title"
        @submit.prevent="submit"
      >
        <div id="privacy-hint" class="privacy-hint">
          <ShieldAlert class="icon" aria-hidden="true" />
          <div>
            <strong>Don’t include personal details</strong>Leave out names,
            phone numbers and matriculation numbers. Your request stays on
            record.
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
          class="category-field"
          :aria-invalid="form.errors.categoryId ? true : undefined"
          @focusout="leaveCategories"
        >
          <legend>Request Category</legend>
          <p
            v-if="categories.isPending.value"
            class="field-hint"
            role="status"
          >
            Loading the Request Categories…
          </p>
          <div v-else-if="categoriesFailed" class="category-failure">
            <p class="field-error" role="alert">
              We couldn’t load the Request Categories. Check your connection
              and try again.
            </p>
            <SubmitButton
              type="button"
              variant="outline"
              class="compact-button has-request"
              :pending="categories.isFetching.value"
              @click="categories.refetch()"
              ><RefreshCw class="icon" aria-hidden="true" />Try
              again</SubmitButton
            >
          </div>
          <div v-else class="category-grid">
            <label
              v-for="category in categories.data.value"
              :key="category.id"
              class="category-choice"
              ><input
                v-model="form.values.categoryId"
                type="radio"
                name="categoryId"
                :value="category.id"
                :aria-invalid="form.errors.categoryId ? true : undefined"
                :aria-describedby="categoryDescribedBy()"
                @change="form.blur('categoryId')" /><component
                :is="categoryIcon(category.id)"
                class="icon"
                aria-hidden="true"
              /><span>{{ category.name }}</span></label
            >
          </div>
          <p
            v-if="form.errors.categoryId"
            id="category-error"
            class="field-error"
            aria-live="polite"
          >
            {{ form.errors.categoryId }}
          </p>
          <p id="category-hint" class="field-hint">
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
          <div class="form-actions">
            <SubmitButton
              class="compact-button has-request"
              :pending="send.isPending.value"
              >Submit Service Request</SubmitButton
            >
          </div>
          <p
            v-if="form.formError.value"
            class="field-error form-error"
            role="alert"
          >
            {{ form.formError.value }}
          </p>
        </div>
      </form>
      <aside
        class="settings-section form-aside"
        aria-labelledby="next-title"
      >
        <h2 id="next-title">What happens next</h2>
        <ol class="next-steps">
          <li>
            <StatusChip status="submitted" />
            <p>
              An Administrator gives it an Assignment to a Maintenance Officer.
            </p>
          </li>
          <li>
            <StatusChip status="in_progress" />
            <p>The officer works on it.</p>
          </li>
          <li>
            <StatusChip status="completed" />
            <p>
              You tell us whether it’s fixed. If you don’t answer within 7 days,
              it becomes Verified.
            </p>
          </li>
        </ol>
        <p class="field-hint aside-note">
          Quote your Reference, such as SR-PLUMB-42, if you contact the
          maintenance team.
        </p>
      </aside>
    </div>
  </WorkspaceLayout>
</template>
