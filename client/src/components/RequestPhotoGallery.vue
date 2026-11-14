<script setup lang="ts">
import { computed, reactive } from "vue";
import type { RequestPhoto } from "../service-requests/api";
import { formatDateTime } from "../service-requests/display";

const props = defineProps<{
  photos: RequestPhoto[];
  stage: "report" | "completion";
  refreshing?: boolean;
}>();
const emit = defineEmits<{ failed: [photoId: string]; retry: [] }>();
const failedUrls = reactive(new Map<string, string>());
const selected = computed(() =>
  props.photos.filter((photo) => photo.stage === props.stage),
);
const title = computed(() =>
  props.stage === "report" ? "Report photos" : "Photos of the finished work",
);
const name = (index: number) =>
  `${props.stage === "report" ? "Report" : "Completion"} photo ${index + 1}`;
const broken = (photo: RequestPhoto) => failedUrls.get(photo.id) === photo.url;
function failed(photo: RequestPhoto) {
  failedUrls.set(photo.id, photo.url);
  emit("failed", photo.id);
}
</script>
<template>
  <div v-if="selected.length" class="mt-4 grid gap-2.5">
    <h3 class="m-0 text-[12px] font-semibold">{{ title }}</h3>
    <ul class="grid grid-cols-3 gap-2.5 m-0 p-0 list-none" :aria-label="title">
      <li v-for="(photo, index) in selected" :key="photo.id" class="min-w-0">
        <div
          v-if="broken(photo)"
          class="grid place-items-center aspect-4/3 p-2 border border-campus-gray rounded-[9px] bg-campus-panel text-center text-[11px] text-campus-muted"
          role="status"
        >
          {{
            refreshing ? "Refreshing photo links…" : "This photo couldn’t load."
          }}
        </div>
        <a
          v-else
          :href="photo.url"
          target="_blank"
          rel="noopener noreferrer"
          referrerpolicy="no-referrer"
          :aria-label="`Open ${name(index)} in a new tab`"
          class="block overflow-hidden border border-campus-gray rounded-[9px] bg-campus-panel"
        >
          <img
            :src="photo.url"
            :alt="name(index)"
            referrerpolicy="no-referrer"
            class="block w-full aspect-4/3 object-cover"
            @error="failed(photo)"
          />
        </a>
        <p class="mt-1.5 mb-0 text-[11px] leading-relaxed text-campus-muted">
          {{ name(index)
          }}<span v-if="stage === 'completion'" class="block">{{
            formatDateTime(photo.attachedAt)
          }}</span>
        </p>
      </li>
    </ul>
    <button
      v-if="selected.some(broken)"
      type="button"
      :disabled="refreshing"
      class="justify-self-start min-h-9 text-[11px] underline underline-offset-4 disabled:opacity-65"
      @click="emit('retry')"
    >
      Refresh photo links
    </button>
  </div>
</template>
