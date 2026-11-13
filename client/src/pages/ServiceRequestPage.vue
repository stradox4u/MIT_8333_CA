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
import { isLoadFailure, useExpiredSession } from "../lib/expired-session";
import { ApiError } from "../lib/api";
import LoadFailure from "../components/LoadFailure.vue";
import CircleHelp from "~icons/lucide/circle-help";
import {
  serviceRequestOptions,
  type Status,
  type StatusUpdate,
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
      .find(
        (entry): entry is StatusUpdate =>
          entry.type === "status_update" && entry.toStatus === "cancelled",
      ) ?? null
  );
});
</script>
<template>
  <WorkspaceLayout width="narrow">
    <RouterLink
      to="/requests"
      class="inline-flex items-center gap-1.5 min-h-9 mb-2.5 text-campus-navy text-[12px] underline-offset-4"
      ><ArrowLeft
        class="icon inline-block w-4 h-4 flex-none align-[-3px]"
        aria-hidden="true"
      />My requests</RouterLink
    >
    <p
      v-if="justSubmitted"
      ref="notice"
      class="mt-4.5 mx-0 mb-0 py-2.25 px-3 border-0 rounded-[7px] shadow-none bg-campus-panel text-[12px] leading-[1.65] [&.page-feedback]:flex [&.page-feedback]:items-start [&.page-feedback]:gap-2.25 [&.page-feedback]:mt-0 [&.page-feedback]:mx-0 [&.page-feedback]:mb-4.5 [&.page-feedback]:py-2.5 [&.page-feedback]:px-3.25 [&.page-feedback]:border [&.page-feedback]:border-campus-gray [&.page-feedback]:bg-campus-surface [&.success]:border-campus-navy success page-feedback"
      role="status"
      tabindex="-1"
    >
      <CircleCheck
        class="icon inline-block w-4 h-4 flex-none align-[-3px] mt-px"
        aria-hidden="true"
      /><span
        >Service Request <strong>{{ reference }}</strong> submitted.</span
      >
    </p>
    <section
      v-if="notFound"
      class="mb-4.5 border border-campus-gray p-6 rounded-[13px] bg-campus-surface shadow-none phone:py-4.75 phone:px-3.75"
    >
      <span
        class="state-icon w-11.5 h-11.5 grid place-items-center bg-campus-green border border-campus-navy rounded-[13px] [&.quiet]:bg-campus-panel quiet mb-4.5"
        ><CircleHelp
          class="icon inline-block flex-none align-[-3px] w-5.5 h-5.5"
          aria-hidden="true"
      /></span>
      <h1>We can’t find {{ reference }}</h1>
      <p
        class="intro mt-0 mx-0 text-[13px] leading-[1.7] text-campus-muted wrap-anywhere mb-5"
      >
        Check the Reference. If someone shared it with you, you may not have
        access to it.
      </p>
      <RouterLink
        to="/requests"
        class="button inline-flex relative items-center justify-center gap-2.5 py-2.75 px-8.25 border border-campus-navy rounded-[7px] text-campus-navy text-[12px] font-semibold leading-normal text-center no-underline disabled:opacity-65 [&_.icon]:w-3.75 [&_.icon]:h-3.75 bg-transparent enabled:hover:bg-campus-panel compact-button w-auto max-w-full min-h-10.5 phone:w-full"
        >My requests</RouterLink
      >
    </section>
    <LoadFailure
      v-else-if="isLoadFailure(request.error.value)"
      class="mb-4.5 border border-campus-gray p-6 rounded-[13px] bg-campus-surface shadow-none phone:py-4.75 phone:px-3.75 [&_.state-icon]:mb-4.5 [&_.intro]:mb-5 phone:[&_.button]:w-full"
      :title="`We couldn’t load ${reference}`"
      :level="1"
      :pending="request.isFetching.value"
      @retry="request.refetch()"
    />
    <p
      v-else-if="request.isPending.value"
      class="mb-4.5 border border-campus-gray p-6 rounded-[13px] bg-campus-surface shadow-none phone:py-4.75 phone:px-3.75 m-0 text-campus-muted text-[11px] leading-[1.65]"
      role="status"
    >
      Loading {{ reference }}…
    </p>
    <template v-else-if="request.data.value">
      <section
        class="mb-4.5 border border-campus-gray p-6 rounded-[13px] bg-campus-surface shadow-none phone:py-4.75 sr-head pt-6 px-6.5 pb-5 [&_h1]:mb-3.5 [&_h1]:text-[27px] phone:px-3.75 phone:[&_h1]:text-[23px]"
        aria-labelledby="sr-title"
      >
        <div class="flex flex-wrap items-center gap-y-2 gap-x-2.5 mb-2.5">
          <span
            class="font-[ui-monospace,SFMono-Regular,Menlo,Consolas,monospace] font-semibold leading-[1.3] tracking-[0.02em] whitespace-nowrap text-[13px]"
            >{{ request.data.value.reference }}</span
          ><StatusChip
            :status="request.data.value.status"
            labelled
          /><PriorityTag
            v-if="request.data.value.priority"
            :priority="request.data.value.priority"
            labelled
          />
        </div>
        <h1 id="sr-title">{{ request.data.value.title }}</h1>
        <dl
          class="flex flex-wrap gap-y-2.5 gap-x-6.5 m-0 [&_div]:grid [&_div]:gap-0.5 [&_div]:min-w-0 [&_dt]:text-campus-muted [&_dt]:text-[10px] [&_dt]:font-semibold [&_dt]:tracking-[0.08em] [&_dt]:uppercase [&_dd]:flex [&_dd]:items-center [&_dd]:gap-1.5 [&_dd]:m-0 [&_dd]:text-[12px] [&_dd]:wrap-anywhere phone:grid phone:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] phone:gap-3"
        >
          <div>
            <dt>Request Category</dt>
            <dd><CategoryTag :category="request.data.value.category" /></dd>
          </div>
          <div>
            <dt>Location</dt>
            <dd>
              <MapPin
                class="icon inline-block flex-none align-[-3px] w-3.75 h-3.75"
                aria-hidden="true"
              />{{ request.data.value.location }}
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
          <div>
            <dt>Maintenance Officer</dt>
            <dd>
              <template v-if="request.data.value.assignment">{{
                request.data.value.assignment.officer.id === me.data.value?.id
                  ? "You"
                  : request.data.value.assignment.officer.name
              }}</template
              ><span v-else class="text-campus-muted">{{
                ["submitted", "assigned", "in_progress"].includes(
                  request.data.value.status,
                )
                  ? "Not assigned yet"
                  : "None"
              }}</span>
            </dd>
          </div>
        </dl>
        <p
          v-if="request.data.value.status === 'cancelled'"
          class="flex items-start gap-2.5 mt-4.5 mx-0 mb-0 py-3 px-3.5 rounded-[9px] bg-campus-cancelled text-[12px] leading-[1.6]"
        >
          <Ban
            class="icon inline-block w-4 h-4 flex-none align-[-3px] mt-0.5"
            aria-hidden="true"
          /><span
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
            class="grid grid-cols-5 mt-5 mx-0 mb-0 pt-4 px-0 pb-0 border-t border-t-campus-panel list-none [&_li::before]:content-[''] [&_li::before]:absolute [&_li::before]:top-2.75 [&_li::before]:-left-1/2 [&_li::before]:right-1/2 [&_li::before]:h-0.5 [&_li::before]:bg-campus-gray [&_li:first-child::before]:hidden [&_li.done::before]:bg-campus-navy [&_li.current::before]:bg-campus-navy [&_li.done_.step-dot]:border-campus-navy [&_li.done_.step-dot]:bg-campus-navy [&_li.done_.step-dot]:text-campus-surface [&_li.current]:text-campus-navy [&_li.current]:font-[650] [&_li.current_.step-dot]:border-campus-navy [&_li.current_.step-dot]:bg-campus-green [&_li.current_.step-dot]:shadow-[0_0_0_3px_var(--color-campus-surface),0_0_0_4.5px_var(--color-campus-navy)] phone:grid-cols-[minmax(0,1fr)] phone:gap-0 phone:pt-3 phone:[&_li::before]:left-2.75 phone:[&_li::before]:right-auto phone:[&_li::before]:-top-2.25 phone:[&_li::before]:w-0.5 phone:[&_li::before]:h-3.5 phone:[&:not(.expanded)_li:not(.current)]:hidden phone:[&:not(.expanded)_li::before]:hidden"
            :class="{ expanded: allSteps }"
            aria-label="Progress"
          >
            <li
              class="relative grid justify-items-center gap-1.5 text-campus-muted text-[11px] text-center phone:grid-cols-[24px_1fr] phone:justify-items-start phone:items-center phone:gap-2.5 phone:py-1.25 phone:px-0 phone:text-left"
              v-for="(step, index) in steps"
              :key="step"
              :class="{
                done: index < currentStep,
                current: index === currentStep,
              }"
              :aria-current="index === currentStep ? 'step' : undefined"
            >
              <span
                class="step-dot relative z-1 grid place-items-center w-6 h-6 border-[1.5px] border-campus-control rounded-full bg-campus-surface"
                ><Check
                  v-if="index < currentStep"
                  class="icon inline-block flex-none align-[-3px] w-3.25 h-3.25"
                  aria-hidden="true" /><component
                  :is="statusIcons[step]"
                  v-else-if="index === currentStep"
                  class="icon inline-block flex-none align-[-3px] w-3.25 h-3.25"
                  aria-hidden="true"
              /></span>
              <span
                >{{ statusNames[step]
                }}<span
                  v-if="index < currentStep"
                  class="absolute w-px h-px -m-px p-0 overflow-hidden [clip:rect(0_0_0_0)] whitespace-nowrap border-0"
                >
                  (done)</span
                ><span
                  v-else-if="index > currentStep"
                  class="absolute w-px h-px -m-px p-0 overflow-hidden [clip:rect(0_0_0_0)] whitespace-nowrap border-0"
                >
                  (to come)</span
                ></span
              >
            </li>
          </ol>
          <button
            type="button"
            class="border-0 py-2 px-0.5 text-campus-navy bg-transparent text-[12px] underline underline-offset-4 phone:min-h-11 hidden phone:inline-flex"
            :aria-expanded="allSteps"
            aria-controls="steps"
            @click="allSteps = !allSteps"
          >
            {{ allSteps ? "Show current step only" : "Show all steps" }}
          </button>
        </template>
      </section>
      <section
        class="mb-4.5 border border-campus-gray p-6 rounded-[13px] bg-campus-surface shadow-none phone:py-4.75 phone:px-3.75"
        aria-labelledby="desc-title"
      >
        <div
          class="flex items-center gap-3 mb-5 [&_p]:m-0 [&_p]:text-campus-muted [&_p]:text-[12px] [&_p]:leading-[1.65] [&.tight]:mb-3 [&_>_div]:flex-1 [&_>_div]:min-w-0 tight"
        >
          <h2
            class="mt-0 mx-0 mb-0.75 text-[16px] font-semibold"
            id="desc-title"
          >
            Description
          </h2>
        </div>
        <p
          class="description m-0 text-[13px] leading-[1.75] whitespace-pre-wrap wrap-anywhere"
        >
          {{ request.data.value.description }}
        </p>
      </section>
      <section
        class="mb-4.5 border border-campus-gray p-6 rounded-[13px] bg-campus-surface shadow-none phone:py-4.75 phone:px-3.75"
        aria-labelledby="tl-title"
      >
        <div class="flex items-center gap-3 mb-5 [&.tight]:mb-3">
          <span
            class="grid place-items-center flex-none w-9 h-9 rounded-[10px] bg-campus-green [&.quiet]:bg-campus-panel quiet"
            ><History
              class="icon inline-block flex-none align-[-3px] w-4.5 h-4.5"
              aria-hidden="true"
          /></span>
          <div class="flex-1 min-w-0">
            <h2
              class="mt-0 mx-0 mb-0.75 text-[16px] font-semibold"
              id="tl-title"
            >
              Timeline
            </h2>
            <p class="m-0 text-campus-muted text-[12px] leading-[1.65]">
              Status Updates and Assignments, oldest first.
            </p>
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
