<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch, useId } from "vue";
import ImagePlus from "~icons/lucide/image-plus";
import { useAuthNavigation } from "../auth/navigation";
import { isExpiredSession } from "../lib/expired-session";
import { ApiError, errorMessage } from "../lib/api";
import type { RequestPhoto } from "../service-requests/api";
import { uploadPhoto, type PhotoSelection } from "../service-requests/photos";

const navigation = useAuthNavigation();
const props = defineProps<{
  initialPhotos?: RequestPhoto[];
  disabled?: boolean;
  error?: string;
  label?: string;
  describedBy?: string;
  refreshing?: boolean;
}>();
const emit = defineEmits<{ failed: [photoId: string]; retry: [] }>();
const id = useId();
const errors = ref<string[]>([]);
const selection = defineModel<PhotoSelection>({ required: true });
interface Upload {
  id: number;
  file?: File;
  name: string;
  photoId?: string;
  previewFailed?: string;
  preview: string;
  percent: number;
  state: "uploading" | "uploaded" | "failed";
  objectKey?: string;
  failure?: string;
  controller?: AbortController;
}
let nextId = 0;
const uploads = ref<Upload[]>(
  (props.initialPhotos ?? []).map((photo, index) => ({
    id: nextId++,
    photoId: photo.id,
    name: `Report photo ${index + 1}`,
    preview: photo.url,
    objectKey: photo.objectKey,
    percent: 100,
    state: "uploaded",
  })),
);
watch(
  () => props.initialPhotos,
  (photos) => {
    for (const upload of uploads.value) {
      if (upload.file) continue;
      const current = photos?.find(
        (photo) => photo.objectKey === upload.objectKey,
      );
      if (current) upload.preview = current.url;
    }
  },
);
function failedPreview(upload: Upload) {
  upload.previewFailed = upload.preview;
  if (upload.photoId) emit("failed", upload.photoId);
}
const state = computed<PhotoSelection>(() => ({
  photoKeys: uploads.value.flatMap((upload) =>
    upload.objectKey ? [upload.objectKey] : [],
  ),
  pending: uploads.value.some((upload) => upload.state === "uploading"),
  failed: uploads.value.some((upload) => upload.state === "failed"),
}));
watch(
  state,
  (value) => {
    selection.value = value;
  },
  { immediate: true },
);
async function add(event: Event) {
  const input = event.target as HTMLInputElement;
  if (props.disabled) return;
  errors.value = [];
  for (const file of Array.from(input.files ?? [])) {
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      errors.value.push(`${file.name}: Choose a JPEG, PNG or WebP photo.`);
      continue;
    }
    if (!file.size || file.size > 5 * 1024 * 1024) {
      errors.value.push(`${file.name}: Choose a nonempty photo up to 5 MiB.`);
      continue;
    }
    if (uploads.value.length >= 3) {
      errors.value.push("Choose up to 3 photos.");
      break;
    }
    const id = nextId++;
    uploads.value.push({
      id,
      file,
      name: file.name,
      preview: URL.createObjectURL(file),
      percent: 0,
      state: "uploading",
      controller: new AbortController(),
    });
    const upload = uploads.value.find((item) => item.id === id)!;
    void send(upload);
  }
  input.value = "";
}
async function send(upload: Upload) {
  if (!upload.file || !upload.controller) return;
  try {
    upload.objectKey = await uploadPhoto(
      upload.file,
      upload.controller.signal,
      (percent) => {
        upload.percent = percent;
      },
    );
    upload.percent = 100;
    upload.state = "uploaded";
  } catch (error) {
    if (upload.controller.signal.aborted) return;
    if (isExpiredSession(error)) return void navigation.expire();
    upload.failure =
      error instanceof ApiError
        ? errorMessage(error)
        : "Try again, or remove this photo.";
    upload.state = "failed";
  }
}
function retry(upload: Upload) {
  if (props.disabled) return;
  upload.controller = new AbortController();
  upload.percent = 0;
  upload.failure = "";
  upload.state = "uploading";
  void send(upload);
}
function dispose(upload: Upload) {
  upload.controller?.abort();
  if (upload.file) URL.revokeObjectURL(upload.preview);
}
function remove(upload: Upload) {
  if (props.disabled) return;
  dispose(upload);
  uploads.value = uploads.value.filter((item) => item.id !== upload.id);
  errors.value = [];
}
onBeforeUnmount(() => {
  for (const upload of uploads.value) dispose(upload);
});
</script>
<template>
  <fieldset class="grid gap-2.5 min-w-0 m-0 p-0 border-0">
    <legend class="mb-2 p-0 text-[12px] font-semibold">
      {{ label ?? "Photos" }} (optional)
    </legend>
    <div
      class="flex flex-wrap items-center gap-y-2.5 gap-x-3.5 p-4 border-[1.5px] border-dashed border-campus-control rounded-[10px] bg-campus-surface"
    >
      <label
        class="inline-flex relative items-center justify-center gap-2 min-h-10 py-2 px-3.5 border border-campus-navy rounded-[7px] text-[12px] font-semibold focus-within:outline-3 focus-within:outline-solid focus-within:outline-campus-navy focus-within:outline-offset-3"
        :class="
          disabled
            ? 'opacity-65 cursor-default'
            : 'cursor-pointer hover:bg-campus-panel'
        "
      >
        <ImagePlus class="w-4 h-4" aria-hidden="true" /><span>Add photos</span>
        <input
          :disabled="disabled"
          type="file"
          multiple
          accept="image/jpeg,image/png,image/webp"
          :aria-invalid="errors.length || error ? true : undefined"
          :aria-describedby="
            [
              `${id}-photo-hint`,
              errors.length || error ? `${id}-photo-error` : '',
              describedBy,
            ]
              .filter(Boolean)
              .join(' ')
          "
          aria-label="Add photos"
          class="sr-only"
          @change="add"
        />
      </label>
      <p
        :id="`${id}-photo-hint`"
        class="flex-1 basis-50 m-0 text-[11px] leading-relaxed text-campus-muted"
      >
        JPEG, PNG or WebP, up to 5 MiB each. Up to 3 photos. Keep faces and
        documents out of photos.
      </p>
    </div>
    <p
      v-if="errors.length || error"
      :id="`${id}-photo-error`"
      class="m-0 text-[11px] leading-relaxed text-error"
      role="alert"
    >
      {{ errors.join(" ") }} {{ error }}
    </p>
    <ul
      v-if="uploads.length"
      aria-label="Added photos"
      class="grid grid-cols-3 gap-2.5 m-0 p-0 list-none phone:grid-cols-2"
    >
      <li
        v-for="upload in uploads"
        :key="upload.id"
        class="min-w-0 grid overflow-hidden border border-campus-gray rounded-[10px] bg-campus-surface"
      >
        <div
          v-if="upload.previewFailed === upload.preview"
          class="grid place-items-center aspect-4/3 p-2 rounded-lg bg-campus-panel text-center text-[11px] text-campus-muted"
          role="status"
        >
          {{
            upload.file
              ? "Preview unavailable."
              : refreshing
                ? "Refreshing photo links…"
                : "This photo couldn’t load."
          }}
        </div>
        <img
          v-else
          :src="upload.preview"
          :alt="`${upload.name} preview`"
          referrerpolicy="no-referrer"
          class="block w-full aspect-4/3 object-cover bg-campus-panel"
          @error="failedPreview(upload)"
        />
        <div class="grid gap-1.25 px-2.5 pt-2 pb-2.5">
          <span class="truncate text-[11px] font-semibold">{{
            upload.name
          }}</span>
          <span class="text-[11px] text-campus-muted" role="status">{{
            upload.state === "uploaded"
              ? "Uploaded"
              : upload.state === "failed"
                ? "Upload failed"
                : `Uploading ${upload.percent}%`
          }}</span>
          <p
            v-if="upload.failure"
            class="m-0 text-[11px] leading-relaxed text-error"
            role="alert"
          >
            {{ upload.failure }}
          </p>
          <progress
            v-if="upload.state === 'uploading'"
            :aria-label="`${upload.name} upload`"
            :value="upload.percent"
            max="100"
            class="w-full h-1.5 accent-campus-navy"
          />
          <div class="flex flex-wrap gap-x-3 text-[11px]">
            <button
              v-if="upload.state === 'failed'"
              :disabled="disabled"
              type="button"
              :aria-label="`Retry ${upload.name}`"
              class="min-h-9 underline underline-offset-4"
              @click="retry(upload)"
            >
              Try again
            </button>
            <button
              :disabled="disabled"
              type="button"
              :aria-label="`Remove ${upload.name}`"
              class="min-h-9 underline underline-offset-4"
              @click="remove(upload)"
            >
              Remove
            </button>
          </div>
        </div>
      </li>
    </ul>
    <button
      v-if="
        uploads.some(
          (upload) => upload.photoId && upload.previewFailed === upload.preview,
        )
      "
      type="button"
      :disabled="disabled || refreshing"
      class="justify-self-start min-h-9 text-[11px] underline underline-offset-4 disabled:opacity-65"
      @click="emit('retry')"
    >
      Refresh photo links
    </button>
  </fieldset>
</template>
