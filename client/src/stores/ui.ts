import { defineStore } from "pinia";
import { ref } from "vue";

/** Shared presentation/flow state; identity and sessions belong to Vue Query. */
export const useUiStore = defineStore("ui", () => {
  const email = ref("");
  const keepSignedIn = ref(false);
  const notice = ref("");
  const retryTarget = ref("/");
  /** The Reference just submitted, so its tracking page says so once. */
  const submittedReference = ref("");
  const editedReference = ref("");
  function reset() {
    email.value = "";
    keepSignedIn.value = false;
    notice.value = "";
    retryTarget.value = "/";
    submittedReference.value = "";
    editedReference.value = "";
  }
  return {
    email,
    keepSignedIn,
    notice,
    retryTarget,
    submittedReference,
    editedReference,
    reset,
  };
});
