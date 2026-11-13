<script setup lang="ts">
import { computed, onBeforeUnmount } from "vue";
import { useRoute } from "vue-router";
import { useQuery } from "@tanstack/vue-query";
import ArrowLeft from "~icons/lucide/arrow-left";
import CircleCheck from "~icons/lucide/circle-check";
import WorkspaceLayout from "../layouts/WorkspaceLayout.vue";
import { useUiStore } from "../stores/ui";
import { serviceRequestOptions } from "../service-requests/api";

const route = useRoute();
const ui = useUiStore();
const reference = computed(() => String(route.params.reference));
const request = useQuery(
  computed(() => serviceRequestOptions(reference.value)),
);
const justSubmitted = computed(
  () => ui.submittedReference === reference.value,
);
onBeforeUnmount(() => {
  if (justSubmitted.value) ui.submittedReference = "";
});
</script>
<template>
  <WorkspaceLayout width="narrow">
    <RouterLink to="/requests" class="back-link"
      ><ArrowLeft class="icon" aria-hidden="true" />My requests</RouterLink
    >
    <p
      v-if="justSubmitted"
      class="feedback success page-feedback"
      role="status"
    >
      <CircleCheck class="icon" aria-hidden="true" /><span
        >Service Request <strong>{{ reference }}</strong> submitted.</span
      >
    </p>
    <template v-if="request.data.value">
      <h1>{{ request.data.value.title }}</h1>
    </template>
  </WorkspaceLayout>
</template>
