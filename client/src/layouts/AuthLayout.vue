<script setup lang="ts">
import AppBrand from "../components/AppBrand.vue";
import CampusArt from "../components/CampusArt.vue";
import { useUiStore } from "../stores/ui";
const ui = useUiStore();
</script>
<template>
  <main class="auth-layout min-h-svh grid lg:grid-cols-2">
    <section class="auth-side">
      <AppBrand />
      <div class="auth-card">
        <p class="eyebrow">CAMPUS MAINTENANCE</p>
        <p v-if="ui.notice" class="field-error mb-5" role="alert">
          {{ ui.notice }}
        </p>
        <slot />
      </div>
      <footer class="auth-footer">
        MIT 8333 University · Service Request portal
      </footer>
    </section>
    <aside class="auth-story" aria-label="Campus maintenance">
      <CampusArt />
      <div>
        <span class="story-kicker">OUR CAMPUS. OUR CARE.</span>
        <h2>Small fixes.<br />A better campus.</h2>
        <p>
          Report a fault. Follow its progress.<br />Help keep our university
          working.
        </p>
      </div>
      <p class="story-footer">Built around the people who use our spaces.</p>
    </aside>
  </main>
</template>
