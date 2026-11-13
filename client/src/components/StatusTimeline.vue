<script setup lang="ts">
import ThumbsDown from "~icons/lucide/thumbs-down";
import StatusChip from "./StatusChip.vue";
import type { Person, StatusUpdate } from "../service-requests/api";
import {
  formatDateTime,
  statusIcons,
  statusNames,
} from "../service-requests/display";

/** A Service Request's timeline, oldest first, as the API sends it. */
const props = defineProps<{
  entries: StatusUpdate[];
  requester: Person;
  /** The signed-in User's id, so their own entries read "You". */
  viewerId?: string;
}>();

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
  <ol class="timeline">
    <li
      v-for="(entry, index) in entries"
      :key="`${entry.occurredAt}-${index}`"
    >
      <span
        class="tl-node status"
        :class="{ 'final-cancelled': entry.toStatus === 'cancelled' }"
        ><ThumbsDown v-if="notFixed(entry)" class="icon" aria-hidden="true" /><component
          :is="statusIcons[entry.toStatus]"
          v-else
          class="icon"
          aria-hidden="true"
      /></span>
      <div class="tl-body">
        <p class="tl-title">
          <StatusChip :status="entry.toStatus" /><span>{{ title(entry) }}</span>
        </p>
        <p class="tl-meta">
          Status Update · <strong>{{ actorName(entry.actor) }}</strong
          ><template v-if="entry.actor?.id === requester.id">
            · Requester</template
          >
          ·
          <time :datetime="entry.occurredAt">{{
            formatDateTime(entry.occurredAt)
          }}</time>
        </p>
        <p v-if="entry.reason" class="tl-text">
          <span class="label">Reason</span>{{ entry.reason }}
        </p>
      </div>
    </li>
  </ol>
</template>
