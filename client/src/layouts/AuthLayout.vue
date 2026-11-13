<script setup lang="ts">
import AppBrand from "../components/AppBrand.vue";
import CampusArt from "../components/CampusArt.vue";
import { useUiStore } from "../stores/ui";
const ui = useUiStore();
</script>
<template>
  <main class="auth-layout min-h-svh grid lg:grid-cols-2">
    <section
      class="p-8 flex flex-col min-w-0 auth-mobile:min-h-svh phone:py-6.75 phone:px-4.25"
    >
      <AppBrand />
      <div
        class="w-full max-w-97.5 my-10 mx-auto py-7 px-6.25 border border-campus-gray rounded-[18px] bg-campus-surface phone:my-9 phone:mx-auto phone:py-6.25 phone:px-5"
      >
        <p
          class="mt-0 mx-0 mb-4.25 text-[10px] font-semibold tracking-[0.16em] uppercase"
        >
          CAMPUS MAINTENANCE
        </p>
        <p
          v-if="ui.notice"
          class="field-error mt-1.25 mx-0 text-error text-[11px] leading-[1.65] mb-5"
          role="alert"
        >
          {{ ui.notice }}
        </p>
        <slot />
      </div>
      <footer class="mt-auto text-center text-[10px] text-campus-muted">
        MIT 8333 University · Service Request portal
      </footer>
    </section>
    <aside
      class="flex flex-col items-center justify-center pt-10.5 px-7 pb-6.25 bg-campus-surface text-center min-w-0 auth-mobile:hidden"
      aria-label="Campus maintenance"
    >
      <CampusArt />
      <div>
        <span
          class="inline-block pb-3.25 border-b-2 border-b-campus-green text-[9px] font-semibold tracking-[0.17em]"
          >OUR CAMPUS. OUR CARE.</span
        >
        <h2
          class="mt-5 mx-0 mb-3.75 text-[32px] font-semibold leading-[1.16] tracking-[-0.04em]"
        >
          Small fixes.<br />A better campus.
        </h2>
        <p class="m-0 text-[12px] leading-[1.75] text-campus-muted">
          Report a fault. Follow its progress.<br />Help keep our university
          working.
        </p>
      </div>
      <p class="mt-8.5 mx-0 mb-0 text-[10px] leading-[1.75] text-campus-muted">
        Built around the people who use our spaces.
      </p>
    </aside>
  </main>
</template>
