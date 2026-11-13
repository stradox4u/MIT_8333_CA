<script setup lang="ts">
import { nextTick, ref, watch } from "vue";
import SubmitButton from "./SubmitButton.vue";
import TextField from "./TextField.vue";
import { lengthRule, useFields } from "../lib/fields";
import {
  answerNotFixed,
  cancelRequest,
  type ServiceRequestDetails,
} from "../service-requests/api";
import { useRequestAction, type Report } from "../service-requests/actions";
const props = defineProps<{
  request: ServiceRequestDetails;
  action: "cancel" | "not-fixed";
  report: Report;
  disabled?: boolean;
}>();
const emit = defineEmits<{ busy: [value: boolean] }>();
const opened = ref(false);
const wrapper = ref<HTMLElement | null>(null);
const formElement = ref<HTMLFormElement | null>(null);
const form = useFields(
  { reason: "" },
  { reason: lengthRule("a reason", 3, 1000) },
);
const send = useRequestAction({
  reference: () => props.request.reference,
  run: (reason: string) =>
    props.action === "cancel"
      ? cancelRequest(props.request.reference, reason)
      : answerNotFixed(props.request.reference, reason),
  done: (request) =>
    props.action === "cancel"
      ? `${request.reference} is Cancelled.`
      : `${request.reference} is ${request.status === "assigned" ? "Assigned" : "Submitted"} again.`,
  report: props.report,
  validationError: form.showError,
  forbidden:
    "Your permissions changed. We’ve refreshed the request so you can see what you may do.",
});
watch(send.isPending, (value) => emit("busy", value));
watch(
  () => props.request.reference,
  () => {
    opened.value = false;
    form.values.reason = "";
    form.formError.value = "";
  },
);
async function toggle() {
  if (send.isPending.value) return;
  opened.value = !opened.value;
  await nextTick();
  if (opened.value) formElement.value?.querySelector("textarea")?.focus();
  else wrapper.value?.querySelector("button")?.focus();
}
async function submit() {
  if (send.isPending.value) return;
  if (!form.validate()) {
    await nextTick();
    formElement.value?.querySelector("textarea")?.focus();
    return;
  }
  send.mutate(form.values.reason.trim());
}
</script>
<template>
  <div ref="wrapper" class="contents">
    <SubmitButton
      compact
      type="button"
      variant="outline"
      class="phone:w-full"
      :disabled="disabled || send.isPending.value"
      :aria-expanded="opened"
      :aria-controls="`${action}-form`"
      @click="toggle"
      >{{ action === "cancel" ? "Cancel request" : "Not fixed" }}</SubmitButton
    >
    <form
      v-if="opened"
      ref="formElement"
      :id="`${action}-form`"
      class="col-span-full grid gap-3 mt-3.5 p-4 border border-campus-navy rounded-[9px] bg-campus-panel"
      :aria-label="
        action === 'cancel'
          ? 'Cancel this Service Request?'
          : 'What’s still wrong?'
      "
      novalidate
      @submit.prevent="submit"
    >
      <h3 class="m-0 text-[14px] font-semibold">
        {{
          action === "cancel"
            ? "Cancel this Service Request?"
            : "What’s still wrong?"
        }}
      </h3>
      <p class="m-0 text-[12px] leading-[1.6]">
        {{
          action === "cancel"
            ? "It becomes Cancelled for good. If the fault comes back, report it again."
            : "It goes back to the same officer as Assigned. If they’re no longer available, it returns to Submitted for an Administrator."
        }}
      </p>
      <TextField
        v-model="form.values.reason"
        label="Reason"
        name="reason"
        multiline
        :max="1000"
        :error="form.errors.reason"
        hint="Shown on the timeline. 3–1,000 characters."
        @blur="form.blur('reason')"
        @update:model-value="form.changed('reason')"
      />
      <div
        class="flex flex-wrap items-center gap-x-3.5 gap-y-2.5 phone:[&>button]:w-full"
      >
        <SubmitButton
          compact
          :variant="action === 'cancel' ? 'danger' : 'primary'"
          :pending="send.isPending.value"
          >{{
            action === "cancel" ? "Cancel Service Request" : "Send Not fixed"
          }}</SubmitButton
        >
        <button
          type="button"
          class="py-2 px-0.5 text-[12px] underline underline-offset-4"
          :disabled="send.isPending.value"
          @click="toggle"
        >
          {{ action === "cancel" ? "Keep it" : "Back" }}
        </button>
      </div>
      <p
        v-if="form.formError.value"
        class="m-0 text-error text-[11px] leading-[1.65]"
        role="alert"
      >
        {{ form.formError.value }}
      </p>
    </form>
  </div>
</template>
