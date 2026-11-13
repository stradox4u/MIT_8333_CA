import { defineStore } from "pinia";
import { ref } from "vue";

/** Shared presentation/flow state; identity and sessions belong to Vue Query. */
export const useUiStore = defineStore("ui", () => {
  const email = ref("");
  const keepSignedIn = ref(false);
  const notice = ref("");
  const retryTarget = ref("/");
  function reset() {
    email.value = "";
    keepSignedIn.value = false;
    notice.value = "";
    retryTarget.value = "/";
  }
  return { email, keepSignedIn, notice, retryTarget, reset };
});
