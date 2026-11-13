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
  {
    section: "dashboard",
    to: "/dashboard",
    label: "Dashboard",
    icon: LayoutDashboard,
  },
  { section: "requests", to: "/requests", label: "My Requests", icon: Inbox },
  {
    section: "settings",
    to: "/account/settings",
    label: "Account Settings",
    icon: UserCog,
  },
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
onBeforeUnmount(() => document.removeEventListener("keydown", closeOnEscape));
</script>
<template>
  <div class="min-h-svh py-7 px-8.5 phone:py-6 phone:px-4.25">
    <a
      class="absolute left-[-9999px] top-11 z-5 py-2 px-3 border border-campus-navy rounded-[7px] bg-campus-green text-campus-navy text-[12px] focus:left-3"
      href="#main"
      >Skip to main content</a
    >
    <header
      class="max-w-290 m-auto pb-5 border-b border-b-campus-gray flex items-center gap-5.5 [&_.compact-button]:min-h-10 [&_.compact-button]:py-2 [&_.compact-button]:px-3.5 [&_.compact-button]:gap-2 [&_.compact-button]:whitespace-nowrap [&_.sign-out]:px-8 tablet:gap-2.5 tablet:pb-3.5"
    >
      <RouterLink
        to="/dashboard"
        class="flex items-center gap-2.5 flex-none text-campus-navy no-underline"
        aria-label="MIT 8333 University: Dashboard"
        :aria-current="undefined"
        ><span
          class="grid place-items-center w-9 h-10 border-[1.5px] border-campus-navy rounded-[3px_3px_15px_15px] bg-campus-green [font:700_25px_Georgia,serif]"
          aria-hidden="true"
          >M</span
        ><span class="small-phone:hidden"
          ><strong
            class="block text-[16px] font-[650] leading-[1.2] tracking-[0.02em]"
            >MIT 8333</strong
          ><small class="block mt-1 text-[9px] tracking-[0.25em]"
            >UNIVERSITY</small
          ></span
        >
      </RouterLink>
      <nav
        class="flex items-center flex-wrap gap-y-1 gap-x-4.5 ml-2 [&_a:hover]:underline [&_a:hover]:underline-offset-4 [&_a[aria-current='page']]:font-[650] [&_a[aria-current='page']::after]:content-[''] [&_a[aria-current='page']::after]:absolute [&_a[aria-current='page']::after]:left-0 [&_a[aria-current='page']::after]:right-0 [&_a[aria-current='page']::after]:bottom-0.5 [&_a[aria-current='page']::after]:h-1.5 [&_a[aria-current='page']::after]:rounded-xs [&_a[aria-current='page']::after]:bg-campus-green [&_a[aria-current='page']::after]:shadow-[0_0_0_1px_var(--color-campus-navy)_inset] laptop:gap-y-1 laptop:gap-x-3.5 laptop:ml-0 tablet:hidden"
        aria-label="Main"
      >
        <RouterLink
          class="relative inline-flex items-center min-h-10 py-1 px-0.5 text-campus-navy text-[12px] no-underline"
          v-for="link in links"
          :key="link.to"
          :to="link.to"
          :aria-current="current(link.section)"
          >{{ link.label }}</RouterLink
        >
      </nav>
      <div
        class="ml-auto flex items-center gap-2.5 tablet:[&_.sign-out]:hidden"
      >
        <RouterLink
          to="/requests/new"
          class="button inline-flex relative items-center justify-center gap-2.5 py-2.75 px-8.25 border border-campus-navy rounded-[7px] text-campus-navy text-[12px] font-semibold leading-normal text-center no-underline disabled:opacity-65 bg-campus-green enabled:hover:brightness-97 compact-button w-auto max-w-full min-h-10.5"
          :aria-current="current('report')"
          ><Plus
            class="icon inline-block flex-none align-[-3px] w-3.75 h-3.75"
            aria-hidden="true"
          />Report a fault</RouterLink
        ><SubmitButton
          compact
          type="button"
          class="compact-button sign-out"
          variant="outline"
          :pending="logout.isPending.value"
          :disabled="inFlight > 0"
          @click="logout.mutate()"
          >Sign out</SubmitButton
        ><button
          ref="menuButton"
          type="button"
          class="button relative items-center justify-center gap-2.5 py-2.75 px-8.25 border border-campus-navy rounded-[7px] text-campus-navy text-[12px] font-semibold leading-normal text-center no-underline disabled:opacity-65 bg-transparent enabled:hover:bg-campus-panel compact-button w-auto max-w-full min-h-10.5 menu-button hidden tablet:inline-flex"
          :aria-expanded="menuOpen"
          aria-controls="mobile-menu"
          @click="toggleMenu"
        >
          <Close
            v-if="menuOpen"
            class="icon inline-block flex-none align-[-3px] w-3.75 h-3.75"
            aria-hidden="true"
          /><Menu
            v-else
            class="icon inline-block flex-none align-[-3px] w-3.75 h-3.75"
            aria-hidden="true"
          />Menu
        </button>
      </div>
    </header>
    <div
      id="mobile-menu"
      ref="menuPanel"
      class="hidden tablet:block tablet:my-0 tablet:-mx-4.25 tablet:pt-2 tablet:px-4.25 tablet:pb-3.5 tablet:border-b tablet:border-b-campus-gray tablet:bg-campus-surface tablet:[&_ul]:m-0 tablet:[&_ul]:p-0 tablet:[&_ul]:list-none tablet:[&_a[aria-current='page']]:font-[650] tablet:[&_.button]:mt-3"
      :hidden="!menuOpen"
    >
      <nav aria-label="Main">
        <ul>
          <li v-for="link in links" :key="link.to">
            <RouterLink
              class="tablet:flex tablet:items-center tablet:gap-2.5 tablet:min-h-11.5 tablet:border-b tablet:border-b-campus-panel tablet:text-campus-navy tablet:text-[14px] tablet:no-underline"
              :to="link.to"
              :aria-current="current(link.section)"
              ><component
                :is="link.icon"
                class="icon inline-block w-4 h-4 flex-none align-[-3px]"
                aria-hidden="true"
              />{{ link.label
              }}<span
                v-if="current(link.section)"
                aria-hidden="true"
                class="ml-auto rounded px-1.75 py-0.5 bg-campus-green text-[10px] font-semibold"
                >Current page</span
              ></RouterLink
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
        ><LogOut
          class="icon inline-block w-4 h-4 flex-none align-[-3px]"
          aria-hidden="true"
        />Sign out</SubmitButton
      >
    </div>
    <main
      id="main"
      class="max-w-190 my-8.5 mx-auto [&.wide]:max-w-290 [&.wide]:mt-7 [&.narrow]:mt-7 [&.narrow]:max-w-225 focus:outline-none phone:[&.wide]:mt-5 phone:[&.narrow]:mt-5"
      :class="{ wide: width === 'wide', narrow: width === 'narrow' }"
      tabindex="-1"
    >
      <p
        v-if="ui.notice"
        class="field-error mt-1.25 mx-0 text-error text-[11px] leading-[1.65] mb-5"
        role="alert"
      >
        {{ ui.notice }}
      </p>
      <p
        v-if="error"
        class="field-error mt-1.25 mx-0 text-error text-[11px] leading-[1.65] mb-5"
        role="alert"
      >
        {{ error }}
      </p>
      <slot />
    </main>
    <footer class="text-center mt-6.25 text-[10px] text-campus-muted">
      MIT 8333 University · Service Request portal
    </footer>
  </div>
</template>
