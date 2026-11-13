import type { Component } from "vue";
import Zap from "~icons/lucide/zap";
import Droplets from "~icons/lucide/droplets";
import Armchair from "~icons/lucide/armchair";
import Wifi from "~icons/lucide/wifi";
import Presentation from "~icons/lucide/presentation";
import Shapes from "~icons/lucide/shapes";
import CircleDashed from "~icons/lucide/circle-dashed";
import UserRoundCheck from "~icons/lucide/user-round-check";
import Wrench from "~icons/lucide/wrench";
import CircleCheck from "~icons/lucide/circle-check";
import BadgeCheck from "~icons/lucide/badge-check";
import Ban from "~icons/lucide/ban";
import type { Priority, Status } from "./api";

/** How Service Request values read and look, in GLOSSARY.md's terms. */

export const statusNames: Record<Status, string> = {
  submitted: "Submitted",
  assigned: "Assigned",
  in_progress: "In Progress",
  completed: "Completed",
  verified: "Verified",
  cancelled: "Cancelled",
};
export const statusIcons: Record<Status, Component> = {
  submitted: CircleDashed,
  assigned: UserRoundCheck,
  in_progress: Wrench,
  completed: CircleCheck,
  verified: BadgeCheck,
  cancelled: Ban,
};

export const priorityNames: Record<Priority, string> = {
  low: "Low",
  normal: "Normal",
  high: "High",
  urgent: "Urgent",
};
export const priorityLevels: Record<Priority, number> = {
  low: 1,
  normal: 2,
  high: 3,
  urgent: 4,
};

const categoryIcons: Record<string, Component> = {
  electrical: Zap,
  plumbing: Droplets,
  furniture: Armchair,
  network: Wifi,
  classroom_equipment: Presentation,
  other: Shapes,
};
export const categoryIcon = (id: string) => categoryIcons[id] ?? Shapes;

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];
const pad = (n: number) => String(n).padStart(2, "0");

/** "12 Nov 2026", in the viewer's time zone. */
export function formatDate(iso: string) {
  const date = new Date(iso);
  return `${date.getDate()} ${MONTHS[date.getMonth()]} ${date.getFullYear()}`;
}
/** "12 Nov" this year, otherwise "12 Nov 2025". */
export function formatShortDate(iso: string, now = new Date()) {
  const date = new Date(iso);
  return date.getFullYear() === now.getFullYear()
    ? `${date.getDate()} ${MONTHS[date.getMonth()]}`
    : formatDate(iso);
}
/** "12 Nov 2026, 09:00". */
export function formatDateTime(iso: string) {
  const date = new Date(iso);
  return `${formatDate(iso)}, ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
