import { queryOptions } from "@tanstack/vue-query";
import { api } from "../lib/api";
export interface Session {
  id: string;
  userAgent: string | null;
  signedInAt: string;
  lastActiveAt: string;
  current: boolean;
}
export const sessionsKey = ["auth", "sessions"] as const;
export const sessionsOptions = queryOptions({
  queryKey: sessionsKey,
  queryFn: ({ signal }) => api<Session[]>("/auth/sessions", { signal }),
  retry: false,
  refetchOnMount: false,
  refetchOnWindowFocus: false,
  refetchOnReconnect: false,
});
export function deviceName(agent: string | null): string {
  if (!agent) return "Unknown device";
  const browser = /Edg\//.test(agent)
    ? "Edge"
    : /Firefox\//.test(agent)
      ? "Firefox"
      : /Chrome\//.test(agent)
        ? "Chrome"
        : /Safari\//.test(agent)
          ? "Safari"
          : null;
  const system = /Android/.test(agent)
    ? "Android"
    : /iPhone|iPad/.test(agent)
      ? "iOS"
      : /Windows/.test(agent)
        ? "Windows"
        : /Macintosh|Mac OS/.test(agent)
          ? "macOS"
          : /Linux/.test(agent)
            ? "Linux"
            : null;
  return browser ? browser + (system ? ` on ${system}` : "") : agent;
}
export function displayDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.valueOf())
    ? "Unknown time"
    : date.toLocaleString(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
      });
}
