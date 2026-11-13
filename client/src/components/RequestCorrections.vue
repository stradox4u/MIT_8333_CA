<script setup lang="ts">
import { computed, nextTick, ref } from "vue";
import { useQuery } from "@tanstack/vue-query";
import SubmitButton from "./SubmitButton.vue";
import TextField from "./TextField.vue";
import { useFields, lengthRule } from "../lib/fields";
import { useExpiredSession } from "../lib/expired-session";
import {
  editRequest,
  requestCategoriesOptions,
  type ServiceRequestDetails,
} from "../service-requests/api";
import { useRequestAction, type Report } from "../service-requests/actions";
const props = defineProps<{ request: ServiceRequestDetails; report: Report }>();
const opened = ref(false);
const wrapper = ref<HTMLElement | null>(null);
const formElement = ref<HTMLFormElement | null>(null);
const categories = useQuery(
  computed(() => ({ ...requestCategoriesOptions, enabled: opened.value })),
);
useExpiredSession(categories.error);
const form = useFields(
  { categoryId: props.request.category.id, location: props.request.location },
  {
    categoryId: (value) => (value ? "" : "Choose a Request Category."),
    location: lengthRule("the location", 2, 200),
  },
);
async function close() {
  opened.value = false;
  await nextTick();
  wrapper.value?.querySelector("button")?.focus();
}
const save = useRequestAction({
  reference: () => props.request.reference,
  run: (fields: { categoryId: string; location: string }) =>
    editRequest(props.request.reference, fields),
  done: (request) =>
    `Details corrected. The Reference stays ${request.reference}.`,
  report: props.report,
  validationError: (error) => {
    form.showError(error);
    if (form.errors.categoryId) void categories.refetch();
  },
  onDone: () => {
    void close();
  },
  forbidden:
    "Your permissions changed. We’ve refreshed the request so you can see what you may do.",
});
async function open() {
  Object.assign(form.values, {
    categoryId: props.request.category.id,
    location: props.request.location,
  });
  form.formError.value = "";
  for (const key of Object.keys(form.errors)) delete form.errors[key];
  opened.value = true;
  await nextTick();
  formElement.value?.querySelector("select")?.focus();
}
async function submit() {
  if (
    save.isPending.value ||
    categories.isPending.value ||
    categories.error.value
  )
    return;
  if (!form.validate()) {
    await nextTick();
    formElement.value
      ?.querySelector<HTMLElement>('[aria-invalid="true"]')
      ?.focus();
    return;
  }
  save.mutate({
    categoryId: form.values.categoryId,
    location: form.values.location.trim(),
  });
}
</script>
<template>
  <div ref="wrapper">
    <SubmitButton
      compact
      type="button"
      variant="outline"
      class="w-full"
      :disabled="save.isPending.value"
      :aria-expanded="opened"
      aria-controls="corrections-form"
      @click="open"
      >Correct Request Category or location</SubmitButton
    >
    <form
      v-if="opened"
      id="corrections-form"
      ref="formElement"
      class="grid gap-3 mt-3.5 p-4 border border-campus-navy rounded-[9px] bg-campus-panel"
      aria-label="Correct Request Category or location"
      novalidate
      @submit.prevent="submit"
    >
      <div>
        <label
          for="correct-category"
          class="block mb-2 text-[12px] font-semibold"
          >Request Category</label
        >
        <p v-if="categories.isPending.value" role="status" class="text-[12px]">
          Loading Request Categories…
        </p>
        <div v-else-if="categories.error.value" class="grid gap-2">
          <p role="alert" class="text-error text-[11px]">
            We couldn’t load the Request Categories.
          </p>
          <SubmitButton
            compact
            type="button"
            variant="outline"
            :pending="categories.isFetching.value"
            @click="categories.refetch()"
            >Try again</SubmitButton
          >
        </div>
        <select
          v-else
          id="correct-category"
          v-model="form.values.categoryId"
          class="w-full min-h-11.75 px-3.5 border border-campus-control rounded-[7px] bg-campus-surface text-[13px] aria-invalid:border-error"
          :aria-invalid="!!form.errors.categoryId"
          :aria-describedby="
            form.errors.categoryId ? 'correct-category-error' : 'correct-hint'
          "
          @blur="form.blur('categoryId')"
          @change="form.changed('categoryId')"
        >
          <option
            v-for="category in categories.data.value"
            :key="category.id"
            :value="category.id"
          >
            {{ category.name }}
          </option>
        </select>
        <p
          v-if="form.errors.categoryId"
          id="correct-category-error"
          class="text-error text-[11px]"
          role="alert"
        >
          {{ form.errors.categoryId }}
        </p>
      </div>
      <TextField
        v-model="form.values.location"
        label="Location"
        name="correct-location"
        :max="200"
        :error="form.errors.location"
        @blur="form.blur('location')"
        @update:model-value="form.changed('location')"
      />
      <p
        id="correct-hint"
        class="m-0 text-campus-muted text-[11px] leading-[1.65]"
      >
        The Reference stays {{ request.reference }}, even if the Request
        Category changes.
      </p>
      <div class="flex flex-wrap items-center gap-3 phone:[&>button]:w-full">
        <SubmitButton
          compact
          :pending="save.isPending.value"
          :disabled="categories.isPending.value || !!categories.error.value"
          >Save corrections</SubmitButton
        >
        <button
          type="button"
          class="py-2 px-0.5 text-[12px] underline underline-offset-4"
          :disabled="save.isPending.value"
          @click="close"
        >
          Back
        </button>
      </div>
      <p
        v-if="form.formError.value"
        class="text-error text-[11px]"
        role="alert"
      >
        {{ form.formError.value }}
      </p>
    </form>
  </div>
</template>
