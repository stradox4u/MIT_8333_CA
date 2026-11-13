<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref } from "vue";
import GoogleIcon from "~icons/devicon/google";
import SubmitButton from "./SubmitButton.vue";
withDefaults(defineProps<{ keepSignedIn?: boolean; disabled?: boolean }>(), {
  keepSignedIn: false,
  disabled: false,
});
const emit = defineEmits<{ beforeNavigate: []; failure: [error: unknown] }>();
const pending = ref(false);
function restore() {
  pending.value = false;
}
onMounted(() => window.addEventListener("pageshow", restore));
onBeforeUnmount(() => window.removeEventListener("pageshow", restore));
async function start(keepSignedIn: boolean) {
  if (pending.value) return;
  pending.value = true;
  try {
    emit("beforeNavigate");
    await nextTick();
    window.location.assign(
      `/api/auth/oidc/google/login?${new URLSearchParams({ keepSignedIn: String(keepSignedIn), redirectTo: "/auth/complete" })}`,
    );
  } catch (error) {
    pending.value = false;
    emit("failure", error);
  }
}
</script>
<template>
  <SubmitButton
    type="button"
    variant="google"
    class=""
    :pending="pending"
    :disabled="disabled"
    @click="start(keepSignedIn)"
    ><GoogleIcon class="w-4.75 h-4.75 flex-none" aria-hidden="true" />Continue
    with Google</SubmitButton
  >
</template>
