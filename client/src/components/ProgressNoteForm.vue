<script setup lang="ts">
import { nextTick, ref, watch } from "vue";
import MessageSquareText from "~icons/lucide/message-square-text";
import TextField from "./TextField.vue";
import SubmitButton from "./SubmitButton.vue";
import { errorMessage } from "../lib/api";
import { lengthRule, useFields } from "../lib/fields";
import { addProgressNote } from "../service-requests/api";
import { useRequestAction, type Report } from "../service-requests/actions";

const props = defineProps<{
  reference: string;
  isRequester: boolean;
  report: Report;
}>();
const element = ref<HTMLFormElement | null>(null);
const form = useFields(
  { text: "" },
  { text: lengthRule("a Progress Note", 1, 2000) },
);
let focusAfterSend = false;
const send = useRequestAction({
  reference: () => props.reference,
  run: (text: string) => addProgressNote(props.reference, text),
  done: () => "Progress Note added.",
  report: props.report,
  validationError: form.showError,
  requestError: (error) => {
    form.formError.value = errorMessage(error);
  },
  forbidden: "You can no longer add Progress Notes to this Service Request.",
  onDone: () => {
    form.values.text = "";
    focusAfterSend = true;
  },
});
watch(send.isPending, async (pending) => {
  if (pending || !focusAfterSend) return;
  focusAfterSend = false;
  await nextTick();
  element.value?.querySelector("textarea")?.focus();
});
function submit() {
  if (send.isPending.value) return;
  if (!form.validate()) {
    element.value?.querySelector("textarea")?.focus();
    return;
  }
  send.mutate(form.values.text.trim());
}
</script>
<template>
  <form
    ref="element"
    class="grid gap-3 mt-1 pt-4.5 border-t border-campus-panel"
    aria-label="Add a Progress Note"
    novalidate
    @submit.prevent="submit"
  >
    <fieldset :disabled="send.isPending.value" class="contents">
      <TextField
        v-model="form.values.text"
        label="Add a Progress Note"
        name="text"
        multiline
        :max="2000"
        :error="form.errors.text"
        class="[&_textarea]:min-h-23"
        :placeholder="
          isRequester
            ? 'For example, when the room is open'
            : 'For example, Waiting for a replacement part'
        "
        hint="Everyone who can see this request can read it. Progress Notes don’t change the Status and can’t be edited or deleted."
        @blur="form.blur('text')"
        @update:model-value="form.changed('text')"
      />
      <div>
        <SubmitButton
          compact
          variant="outline"
          class="[&.button]:min-h-10 [&.button]:py-2 [&.button]:px-3.5 [&.button]:gap-2 [&>span]:gap-2"
          :class="send.isPending.value ? '[&.button]:pr-8' : ''"
          :pending="send.isPending.value"
          ><MessageSquareText class="icon" aria-hidden="true" />Add Progress
          Note</SubmitButton
        >
        <p
          v-if="form.formError.value"
          class="mt-3 mb-0 text-error text-[11px] leading-[1.65]"
          role="alert"
        >
          {{ form.formError.value }}
        </p>
      </div>
    </fieldset>
  </form>
</template>
