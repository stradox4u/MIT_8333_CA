<script setup lang="ts">
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  watch,
} from "vue";
import { useRoute } from "vue-router";
import { useIsMutating, useMutation } from "@tanstack/vue-query";
import Plus from "~icons/lucide/plus";
import Menu from "~icons/lucide/menu";
import Close from "~icons/lucide/x";
import LogOut from "~icons/lucide/log-out";
import LayoutDashboard from "~icons/lucide/layout-dashboard";
import Inbox from "~icons/lucide/inbox";
import UserCog from "~icons/lucide/user-cog";
import SubmitButton from "../components/SubmitButton.vue";
import { useAuthNavigation } from "../auth/navigation";
import { useUiStore } from "../stores/ui";
import { errorMessage } from "../lib/api";

withDefaults(defineProps<{ width?: "default" | "wide" | "narrow" }>(), {
  width: "default",
});

const navigation = useAuthNavigation();
const ui = useUiStore();
const route = useRoute();
const error = ref("");
const inFlight = useIsMutating();
const menuOpen = ref(false);
const menuButton = ref<HTMLButtonElement | null>(null);
const logout = useMutation({
  mutationFn: () => navigation.signOut(),
  onError: (failure) => {
    error.value = errorMessage(failure);
  },
});

/** Which part of the workspace this page belongs to, for `aria-current`. */
const sections = {
  dashboard: ["dashboard"],
  requests: ["my-requests", "service-request"],
  settings: ["settings"],
  report: ["report-fault"],
} as const;
type Section = keyof typeof sections;
const active = computed(
  () =>
    (Object.keys(sections) as Section[]).find((section) =>
      (sections[section] as readonly string[]).includes(String(route.name)),
    ) ?? null,
);
const current = (section: Section) =>
  active.value === section ? "page" : undefined;
const links = [
  { section: "dashboard", to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { section: "requests", to: "/requests", label: "My requests", icon: Inbox },
  { section: "settings", to: "/account/settings", label: "Account settings", icon: UserCog },
] as const;

watch(
  () => route.fullPath,
  () => {
    menuOpen.value = false;
  },
);
const menuPanel = ref<HTMLElement | null>(null);
async function toggleMenu() {
  menuOpen.value = !menuOpen.value;
  if (!menuOpen.value) return;
  await nextTick();
  menuPanel.value?.querySelector("a")?.focus();
}
function closeOnEscape(event: KeyboardEvent) {
  if (event.key !== "Escape" || !menuOpen.value) return;
  menuOpen.value = false;
  menuButton.value?.focus();
}
onMounted(() => document.addEventListener("keydown", closeOnEscape));
onBeforeUnmount(() =>
  document.removeEventListener("keydown", closeOnEscape),
);
</script>
<template>
  <div class="workspace">
    <a class="skip-link" href="#main">Skip to main content</a>
    <header class="workspace-header">
      <RouterLink
        to="/dashboard"
        class="brand"
        aria-label="MIT 8333 University: Dashboard"
        :aria-current="undefined"
        ><span class="brand-mark" aria-hidden="true">M</span
        ><span><strong>MIT 8333</strong><small>UNIVERSITY</small></span>
      </RouterLink>
      <nav class="main-nav" aria-label="Main">
        <RouterLink
          v-for="link in links"
          :key="link.to"
          :to="link.to"
          :aria-current="current(link.section)"
          >{{ link.label }}</RouterLink
        >
      </nav>
      <div class="header-actions">
        <RouterLink
          to="/requests/new"
          class="button button-primary compact-button"
          :aria-current="current('report')"
          ><Plus class="icon" aria-hidden="true" />Report a fault</RouterLink
        ><SubmitButton
          type="button"
          class="compact-button has-request sign-out"
          variant="outline"
          :pending="logout.isPending.value"
          :disabled="inFlight > 0"
          @click="logout.mutate()"
          >Sign out</SubmitButton
        ><button
          ref="menuButton"
          type="button"
          class="button button-outline compact-button menu-button"
          :aria-expanded="menuOpen"
          aria-controls="mobile-menu"
          @click="toggleMenu"
        >
          <Close v-if="menuOpen" class="icon" aria-hidden="true" /><Menu
            v-else
            class="icon"
            aria-hidden="true"
          />Menu
        </button>
      </div>
    </header>
    <div
      id="mobile-menu"
      ref="menuPanel"
      class="mobile-menu"
      :hidden="!menuOpen"
    >
      <nav aria-label="Main">
        <ul>
          <li v-for="link in links" :key="link.to">
            <RouterLink :to="link.to" :aria-current="current(link.section)"
              ><component :is="link.icon" class="icon" aria-hidden="true" />{{
                link.label
              }}</RouterLink
            >
          </li>
        </ul>
      </nav>
      <SubmitButton
        type="button"
        variant="outline"
        :pending="logout.isPending.value"
        :disabled="inFlight > 0"
        @click="logout.mutate()"
        ><LogOut class="icon" aria-hidden="true" />Sign out</SubmitButton
      >
    </div>
    <main
      id="main"
      class="workspace-body"
      :class="{ wide: width === 'wide', narrow: width === 'narrow' }"
      tabindex="-1"
    >
      <p v-if="ui.notice" class="field-error mb-5" role="alert">
        {{ ui.notice }}
      </p>
      <p v-if="error" class="field-error mb-5" role="alert">{{ error }}</p>
      <slot />
    </main>
    <footer class="page-footer">
      MIT 8333 University · Service Request portal
    </footer>
  </div>
</template>
