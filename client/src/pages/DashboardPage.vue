<script setup lang="ts">
import { computed } from "vue";
import { useQuery } from "@tanstack/vue-query";
import WorkspaceLayout from "../layouts/WorkspaceLayout.vue";
import CampusArt from "../components/CampusArt.vue";
import { meOptions, type Role } from "../auth/identity";
const me = useQuery(meOptions);
const roles: Record<Role, string> = {
  student: "Student",
  staff: "Staff",
  maintenance_officer: "Maintenance Officer",
  administrator: "Administrator",
};
const roleName = computed(() =>
  me.data.value?.role ? roles[me.data.value.role] : "",
);
</script>
<template>
  <WorkspaceLayout
    ><section class="settings-section">
      <p class="eyebrow">{{ roleName }} · MIT 8333 UNIVERSITY</p>
      <h1>Your campus workspace</h1>
      <p class="intro">
        Welcome back, {{ me.data.value?.firstName }}. Help keep our university
        spaces working.
      </p>
      <RouterLink
        to="/account/settings"
        class="button button-primary compact-button"
        >Open Account settings</RouterLink
      ><CampusArt class="mx-auto mt-8" /></section
  ></WorkspaceLayout>
</template>
