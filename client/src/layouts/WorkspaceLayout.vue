<script setup lang="ts">
import { ref } from "vue";
import { useIsMutating, useMutation } from "@tanstack/vue-query";
import AppBrand from "../components/AppBrand.vue";
import SubmitButton from "../components/SubmitButton.vue";
import { useAuthNavigation } from "../auth/navigation";
import { useUiStore } from "../stores/ui";
import { errorMessage } from "../lib/api";
const navigation = useAuthNavigation();
const ui = useUiStore();
const error = ref("");
const inFlight = useIsMutating();
const logout = useMutation({
  mutationFn: () => navigation.signOut(),
  onError: (failure) => {
    error.value = errorMessage(failure);
  },
});
</script>
<template>
  <main class="workspace">
    <header class="workspace-header">
      <AppBrand />
      <nav
        class="flex flex-wrap items-center gap-3"
        aria-label="Your workspace"
      >
        <RouterLink to="/dashboard" class="text-link">Dashboard</RouterLink
        ><RouterLink to="/account/settings" class="text-link"
          >Account settings</RouterLink
        ><SubmitButton
          type="button"
          class="compact-button"
          variant="outline"
          :pending="logout.isPending.value"
          :disabled="inFlight > 0"
          @click="logout.mutate()"
          >Sign out</SubmitButton
        >
      </nav>
    </header>
    <div class="workspace-body">
      <p v-if="ui.notice" class="field-error mb-5" role="alert">
        {{ ui.notice }}
      </p>
      <p v-if="error" class="field-error mb-5" role="alert">{{ error }}</p>
      <slot />
    </div>
    <footer class="page-footer">
      MIT 8333 University · Service Request portal
    </footer>
  </main>
</template>
