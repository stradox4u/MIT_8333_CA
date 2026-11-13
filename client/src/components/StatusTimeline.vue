<script setup lang="ts">
import ThumbsDown from "~icons/lucide/thumbs-down";
import UserRoundCheck from "~icons/lucide/user-round-check";
import UserRoundMinus from "~icons/lucide/user-round-minus";
import Repeat from "~icons/lucide/repeat-2";
import Flag from "~icons/lucide/flag";
import StatusChip from "./StatusChip.vue";
import type {
  AssignmentChange,
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

/** A Service Request's timeline, oldest first: Status Updates and Assignment changes. */
const props = defineProps<{
  entries: TimelineEntry[];
  requester: Person;
  /** The signed-in User's id, so their own entries read "You". */
  viewerId?: string;
}>();

const notFixed = (entry: StatusUpdate) =>
  entry.fromStatus === "completed" &&
  (entry.toStatus === "assigned" || entry.toStatus === "submitted");

function statusTitle(entry: StatusUpdate) {
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
const named = (person: Person) =>
  person.id === props.viewerId ? "you" : person.name;
function assignmentTitle(entry: AssignmentChange) {
  const officer = named(entry.officer);
  switch (entry.change) {
    case "assigned":
      return `Assigned to ${officer}`;
    case "reassigned":
      return `Reassigned from ${entry.previousOfficer ? named(entry.previousOfficer) : "another officer"} to ${officer}`;
    case "unassigned":
      return `Unassigned ${officer}`;
    case "officer_left":
      return `${entry.officer.id === props.viewerId ? "You are" : `${entry.officer.name} is`} no longer a Maintenance Officer`;
  }
}
const assignmentIcons = {
  assigned: UserRoundCheck,
  reassigned: Repeat,
  unassigned: UserRoundMinus,
  officer_left: UserRoundMinus,
};
function actorName(entry: TimelineEntry) {
  if (!entry.actor)
    return entry.type === "status_update"
      ? "Automatically, after 7 days"
      : "Automatically";
  return entry.actor.id === props.viewerId ? "You" : entry.actor.name;
}
const isRequester = (actor: Person | null) =>
  !!actor && actor.id === props.requester.id && !isErased(actor);

const node =
  "grid place-items-center w-8.5 h-8.5 border rounded-full [&_svg]:w-4 [&_svg]:h-4";
const label =
  "block mb-0.5 text-campus-muted text-[10px] font-[650] tracking-[0.08em] uppercase";
</script>
<template>
  <ol
    class="relative m-0 p-0 list-none [&>li]:before:absolute [&>li]:before:left-4 [&>li]:before:top-8.5 [&>li]:before:bottom-0 [&>li]:before:w-0.5 [&>li]:before:bg-campus-panel [&>li:last-child]:pb-0 [&>li:last-child]:before:hidden"
  >
    <li
      v-for="(entry, index) in entries"
      :key="`${entry.occurredAt}-${index}`"
      class="relative grid grid-cols-[34px_minmax(0,1fr)] gap-3 pb-5"
    >
      <template v-if="entry.type === 'status_update'">
        <span
          :class="[
            node,
            entry.toStatus === 'cancelled'
              ? 'border-transparent bg-campus-cancelled'
              : 'border-campus-navy bg-campus-green',
          ]"
          ><ThumbsDown v-if="notFixed(entry)" aria-hidden="true" /><component
            :is="statusIcons[entry.toStatus]"
            v-else
            aria-hidden="true"
        /></span>
        <div class="min-w-0 pt-1.25">
          <p
            class="tl-title flex flex-wrap items-center gap-y-1.5 gap-x-2 m-0 text-[13px] font-semibold"
          >
            <StatusChip :status="entry.toStatus" /><span>{{
              statusTitle(entry)
            }}</span>
          </p>
          <p
            class="tl-meta mt-0.75 mb-0 text-campus-muted text-[11px] [&_strong]:text-campus-navy [&_strong]:font-semibold"
          >
            Status Update · <strong>{{ actorName(entry) }}</strong
            ><template v-if="isRequester(entry.actor)"> · Requester</template>
            ·
            <time :datetime="entry.occurredAt">{{
              formatDateTime(entry.occurredAt)
            }}</time>
          </p>
          <p
            v-if="entry.reason"
            class="mt-2 mb-0 py-2.5 px-3 rounded-lg bg-campus-panel text-[12px] leading-[1.65] whitespace-pre-wrap wrap-anywhere"
          >
            <span :class="label">Reason</span>{{ entry.reason }}
          </p>
          <p
            v-if="entry.note"
            class="mt-2 mb-0 py-2.5 px-3 rounded-lg border border-campus-gray bg-white text-[12px] leading-[1.65] whitespace-pre-wrap wrap-anywhere"
          >
            <span :class="label">Completion note</span>{{ entry.note }}
          </p>
        </div>
      </template>
      <template v-else>
        <span :class="[node, 'border-campus-gray bg-campus-panel']"
          ><component :is="assignmentIcons[entry.change]" aria-hidden="true"
        /></span>
        <div class="min-w-0 pt-1.25">
          <p class="tl-title m-0 text-[13px] font-semibold">
            {{ assignmentTitle(entry) }}
          </p>
          <p
            v-if="entry.statusUpdate"
            class="tl-detail flex flex-wrap items-center gap-1.25 mt-1 mb-0 text-campus-muted text-[11px]"
          >
            <Flag class="w-3 h-3" aria-hidden="true" />Status Update:
            {{ statusNames[entry.statusUpdate.fromStatus] }} →
            {{ statusNames[entry.statusUpdate.toStatus] }}
          </p>
          <p
            class="tl-meta mt-0.75 mb-0 text-campus-muted text-[11px] [&_strong]:text-campus-navy [&_strong]:font-semibold"
          >
            Assignment · <strong>{{ actorName(entry) }}</strong>
            ·
            <time :datetime="entry.occurredAt">{{
              formatDateTime(entry.occurredAt)
            }}</time>
          </p>
        </div>
      </template>
    </li>
  </ol>
</template>
