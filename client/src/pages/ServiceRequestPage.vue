<script setup lang="ts">
import { computed, nextTick, ref, watch } from "vue";
import { useRoute } from "vue-router";
import { useQuery } from "@tanstack/vue-query";
import ArrowLeft from "~icons/lucide/arrow-left";
import CircleCheck from "~icons/lucide/circle-check";
import MapPin from "~icons/lucide/map-pin";
import History from "~icons/lucide/history";
import Ban from "~icons/lucide/ban";
import Check from "~icons/lucide/check";
import WorkspaceLayout from "../layouts/WorkspaceLayout.vue";
import StatusChip from "../components/StatusChip.vue";
import PriorityTag from "../components/PriorityTag.vue";
import CategoryTag from "../components/CategoryTag.vue";
import StatusTimeline from "../components/StatusTimeline.vue";
import { useUiStore } from "../stores/ui";
import { meOptions } from "../auth/identity";
import { useExpiredSession } from "../lib/expired-session";
import { ApiError } from "../lib/api";
import SubmitButton from "../components/SubmitButton.vue";
import CircleHelp from "~icons/lucide/circle-help";
import CircleAlert from "~icons/lucide/circle-alert";
import RefreshCw from "~icons/lucide/refresh-cw";
import {
  serviceRequestOptions,
  type Status,
} from "../service-requests/api";
import {
  formatDate,
  statusIcons,
  statusNames,
} from "../service-requests/display";

const route = useRoute();
const ui = useUiStore();
const me = useQuery(meOptions);
const reference = computed(() => String(route.params.reference));
const request = useQuery(
  computed(() => serviceRequestOptions(reference.value)),
);
useExpiredSession(request.error);

/** The submitted notice shows once, on the page for the Reference just submitted. */
const justSubmitted = ref(false);
watch(
  reference,
  (current) => {
    justSubmitted.value = ui.submittedReference === current;
    if (justSubmitted.value) ui.submittedReference = "";
  },
  { immediate: true },
);
const notice = ref<HTMLElement | null>(null);
watch(notice, async (element) => {
  await nextTick();
  element?.focus();
});

/** Unknown, hidden from this User, or not a Reference at all: the same page. */
const notFound = computed(() => {
  const error = request.error.value;
  return (
    error instanceof ApiError && (error.status === 404 || error.status === 400)
  );
});
const loadFailed = computed(
  () =>
    !!request.error.value &&
    !notFound.value &&
    !(request.error.value instanceof ApiError &&
      request.error.value.status === 401),
);

const requesterName = computed(() => {
  const requester = request.data.value?.requester;
  if (!requester) return "";
  return requester.id === me.data.value?.id ? "You" : requester.name;
});

/** The happy path a request moves along; Cancelled leaves it. */
const steps: Status[] = [
  "submitted",
  "assigned",
  "in_progress",
  "completed",
  "verified",
];
const currentStep = computed(() =>
  steps.indexOf(request.data.value?.status ?? "submitted"),
);
const allSteps = ref(false);
const cancellation = computed(() => {
  const data = request.data.value;
  if (data?.status !== "cancelled") return null;
  return (
    [...data.timeline]
      .reverse()
      .find((entry) => entry.toStatus === "cancelled") ?? null
  );
});
</script>
<template>
  <WorkspaceLayout width="narrow">
    <RouterLink to="/requests" class="back-link"
      ><ArrowLeft class="icon" aria-hidden="true" />My requests</RouterLink
    >
    <p
      v-if="justSubmitted"
      ref="notice"
      class="feedback success page-feedback"
      role="status"
      tabindex="-1"
    >
      <CircleCheck class="icon" aria-hidden="true" /><span
        >Service Request <strong>{{ reference }}</strong> submitted.</span
      >
    </p>
    <section v-if="notFound" class="settings-section state-panel">
      <span class="state-icon quiet"
        ><CircleHelp class="icon" aria-hidden="true"
      /></span>
      <h1>We can’t find {{ reference }}</h1>
      <p class="intro">
        Check the Reference. If someone shared it with you, you may not have
        access to it.
      </p>
      <RouterLink to="/requests" class="button button-outline compact-button"
        >My requests</RouterLink
      >
    </section>
    <section
      v-else-if="loadFailed"
      class="settings-section state-panel"
      role="alert"
    >
      <span class="state-icon quiet"
        ><CircleAlert class="icon" aria-hidden="true"
      /></span>
      <h1>We couldn’t load {{ reference }}</h1>
      <p class="intro">Check your connection and try again.</p>
      <SubmitButton
        type="button"
        variant="outline"
        class="compact-button has-request"
        :pending="request.isFetching.value"
        @click="request.refetch()"
        ><RefreshCw class="icon" aria-hidden="true" />Try again</SubmitButton
      >
    </section>
    <p
      v-else-if="request.isPending.value"
      class="settings-section field-hint"
      role="status"
    >
      Loading {{ reference }}…
    </p>
    <template v-else-if="request.data.value">
      <section class="settings-section sr-head" aria-labelledby="sr-title">
        <div class="sr-head-top">
          <span class="ref">{{ request.data.value.reference }}</span
          ><StatusChip :status="request.data.value.status" labelled /><PriorityTag
            v-if="request.data.value.priority"
            :priority="request.data.value.priority"
            labelled
          />
        </div>
        <h1 id="sr-title">{{ request.data.value.title }}</h1>
        <dl class="sr-meta">
          <div>
            <dt>Request Category</dt>
            <dd><CategoryTag :category="request.data.value.category" /></dd>
          </div>
          <div>
            <dt>Location</dt>
            <dd>
              <MapPin class="icon" aria-hidden="true" />{{
                request.data.value.location
              }}
            </dd>
          </div>
          <div>
            <dt>Submitted</dt>
            <dd>
              <time :datetime="request.data.value.submittedAt">{{
                formatDate(request.data.value.submittedAt)
              }}</time>
            </dd>
          </div>
          <div>
            <dt>Requester</dt>
            <dd>{{ requesterName }}</dd>
          </div>
        </dl>
        <p v-if="request.data.value.status === 'cancelled'" class="cancelled-banner">
          <Ban class="icon" aria-hidden="true" /><span
            ><strong>Cancelled</strong
            ><template v-if="cancellation">
              on {{ formatDate(cancellation.occurredAt) }}
              <template v-if="cancellation.actor"
                >by
                {{
                  cancellation.actor.id === me.data.value?.id
                    ? "you"
                    : cancellation.actor.name
                }}</template
              >.<template v-if="cancellation.reason">
                Reason: {{ cancellation.reason }}</template
              ></template
            ></span
          >
        </p>
        <template v-else>
          <ol
            id="steps"
            class="steps"
            :class="{ expanded: allSteps }"
            aria-label="Progress"
          >
            <li
              v-for="(step, index) in steps"
              :key="step"
              :class="{
                done: index < currentStep,
                current: index === currentStep,
              }"
              :aria-current="index === currentStep ? 'step' : undefined"
            >
              <span class="step-dot"
                ><Check
                  v-if="index < currentStep"
                  class="icon"
                  aria-hidden="true" /><component
                  :is="statusIcons[step]"
                  v-else-if="index === currentStep"
                  class="icon"
                  aria-hidden="true"
              /></span>
              <span
                >{{ statusNames[step]
                }}<span v-if="index < currentStep" class="visually-hidden">
                  (done)</span
                ><span v-else-if="index > currentStep" class="visually-hidden">
                  (to come)</span
                ></span
              >
            </li>
          </ol>
          <button
            type="button"
            class="row-action steps-toggle"
            :aria-expanded="allSteps"
            aria-controls="steps"
            @click="allSteps = !allSteps"
          >
            {{ allSteps ? "Show current step only" : "Show all steps" }}
          </button>
        </template>
      </section>
      <section class="settings-section" aria-labelledby="desc-title">
        <div class="section-heading tight">
          <h2 id="desc-title">Description</h2>
        </div>
        <p class="description">{{ request.data.value.description }}</p>
      </section>
      <section class="settings-section" aria-labelledby="tl-title">
        <div class="section-heading">
          <span class="section-icon quiet"
            ><History class="icon" aria-hidden="true"
          /></span>
          <div>
            <h2 id="tl-title">Timeline</h2>
            <p>Status Updates, oldest first.</p>
          </div>
        </div>
        <StatusTimeline
          :entries="request.data.value.timeline"
          :requester="request.data.value.requester"
          :viewer-id="me.data.value?.id"
        />
      </section>
    </template>
  </WorkspaceLayout>
</template>
