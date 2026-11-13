<script setup lang="ts">
import ThumbsDown from "~icons/lucide/thumbs-down";
import StatusChip from "./StatusChip.vue";
import { computed } from "vue";
import type {
  Person,
  StatusUpdate,
  TimelineEntry,
} from "../service-requests/api";
import {
  formatDateTime,
  isErased,
  statusIcons,
  statusNames,
} from "../service-requests/display";

/** A Service Request's timeline, oldest first, as the API sends it. */
const props = defineProps<{
  entries: TimelineEntry[];
  requester: Person;
  /** The signed-in User's id, so their own entries read "You". */
  viewerId?: string;
}>();
const statusUpdates = computed(() =>
  props.entries.filter(
    (entry): entry is StatusUpdate => entry.type === "status_update",
  ),
);

const notFixed = (entry: StatusUpdate) =>
  entry.fromStatus === "completed" &&
  (entry.toStatus === "assigned" || entry.toStatus === "submitted");

function title(entry: StatusUpdate) {
  if (entry.fromStatus === null) return "Fault reported";
  if (notFixed(entry)) return "Not fixed";
  switch (entry.toStatus) {
    case "in_progress":
      return "Work started";
    case "completed":
      return "Work completed";
    case "verified":
      return entry.actor ? "Confirmed fixed" : "No answer within 7 days";
    case "cancelled":
      return "Cancelled";
    default:
      return `${statusNames[entry.fromStatus]} → ${statusNames[entry.toStatus]}`;
  }
}
function actorName(actor: Person | null) {
  if (!actor) return "Automatically, after 7 days";
  return actor.id === props.viewerId ? "You" : actor.name;
}
</script>
<template>
  <ol
    class="timeline relative m-0 p-0 list-none [&_>_li::before]:content-[''] [&_>_li::before]:absolute [&_>_li::before]:left-4 [&_>_li::before]:top-8.5 [&_>_li::before]:bottom-0 [&_>_li::before]:w-0.5 [&_>_li::before]:bg-campus-panel [&_>_li:last-child]:pb-0 [&_>_li:last-child::before]:hidden"
  >
    <li
      class="relative grid grid-cols-[34px_minmax(0,1fr)] gap-3 pb-5"
      v-for="(entry, index) in statusUpdates"
      :key="`${entry.occurredAt}-${index}`"
    >
      <span
        class="grid place-items-center w-8.5 h-8.5 border border-campus-gray rounded-full bg-campus-surface [&.status]:border-campus-navy [&.status]:bg-campus-green [&.status.final-cancelled]:border-transparent [&.status.final-cancelled]:bg-campus-cancelled status"
        :class="{ 'final-cancelled': entry.toStatus === 'cancelled' }"
        ><ThumbsDown
          v-if="notFixed(entry)"
          class="icon inline-block w-4 h-4 flex-none align-[-3px]"
          aria-hidden="true" /><component
          :is="statusIcons[entry.toStatus]"
          v-else
          class="icon inline-block w-4 h-4 flex-none align-[-3px]"
          aria-hidden="true"
      /></span>
      <div class="min-w-0 pt-1.25">
        <p
          class="tl-title flex flex-wrap items-center gap-y-1.5 gap-x-2 m-0 text-[13px] font-semibold"
        >
          <StatusChip :status="entry.toStatus" /><span>{{ title(entry) }}</span>
        </p>
        <p
          class="tl-meta mt-0.75 mx-0 mb-0 text-campus-muted text-[11px] [&_strong]:text-campus-navy [&_strong]:font-semibold"
        >
          Status Update · <strong>{{ actorName(entry.actor) }}</strong
          ><template
            v-if="entry.actor?.id === requester.id && !isErased(entry.actor)"
          >
            · Requester</template
          >
          ·
          <time :datetime="entry.occurredAt">{{
            formatDateTime(entry.occurredAt)
          }}</time>
        </p>
        <p
          v-if="entry.reason"
          class="mt-2 mx-0 mb-0 py-2.5 px-3 rounded-lg bg-campus-panel text-[12px] leading-[1.65] whitespace-pre-wrap wrap-anywhere"
        >
          <span
            class="label block mb-0.5 text-campus-muted text-[10px] font-[650] tracking-[0.08em] uppercase"
            >Reason</span
          >{{ entry.reason }}
        </p>
      </div>
    </li>
  </ol>
</template>
