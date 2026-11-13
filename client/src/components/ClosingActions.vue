<script setup lang="ts">
import SubmitButton from "./SubmitButton.vue";
import { ref } from "vue";
import RequestReasonForm from "./RequestReasonForm.vue";
import {
  verifyRequest,
  type ServiceRequestDetails,
} from "../service-requests/api";
import { useRequestAction, type Report } from "../service-requests/actions";
const props = defineProps<{
  request: ServiceRequestDetails;
  isRequester: boolean;
  report: Report;
}>();
const reasonPending = ref(false);
const verify = useRequestAction({
  reference: () => props.request.reference,
  run: () => verifyRequest(props.request.reference),
  done: (request) => `${request.reference} is Verified.`,
  report: props.report,
  forbidden:
    "Your permissions changed. We’ve refreshed the request so you can see what you may do.",
});
</script>
<template>
  <div class="grid gap-3 mt-4">
    <div class="grid grid-cols-2 gap-3 phone:grid-cols-1">
      <SubmitButton
        compact
        type="button"
        class="w-full"
        :pending="verify.isPending.value"
        :disabled="reasonPending"
        @click="verify.mutate(undefined)"
        >{{ isRequester ? "Fixed" : "Verify" }}</SubmitButton
      >
      <RequestReasonForm
        v-if="isRequester"
        :request="request"
        action="not-fixed"
        :report="report"
        :disabled="verify.isPending.value"
        @busy="reasonPending = $event"
      />
    </div>
  </div>
</template>
