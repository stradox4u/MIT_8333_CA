<script setup lang="ts">
import { computed } from "vue";
import { useQuery } from "@tanstack/vue-query";
import WorkspaceLayout from "../layouts/WorkspaceLayout.vue";
import ListHeading from "../components/ListHeading.vue";
import AdministratorDashboard from "../components/AdministratorDashboard.vue";
import OfficerDashboard from "../components/OfficerDashboard.vue";
import RequesterDashboard from "../components/RequesterDashboard.vue";
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
  <WorkspaceLayout width="wide">
    <ListHeading
      :eyebrow="`${roleName} · MIT 8333 University`"
      :title="`Welcome back, ${me.data.value?.firstName}`"
      :intro="
        me.data.value?.role === 'administrator'
          ? 'What needs attention across campus today.'
          : me.data.value?.role === 'maintenance_officer'
            ? 'Your current Assignments, most urgent first.'
            : 'Report a fault, then follow it here until it’s fixed.'
      "
    />
    <AdministratorDashboard
      v-if="me.data.value?.role === 'administrator'"
    /><OfficerDashboard
      v-else-if="me.data.value?.role === 'maintenance_officer'"
    /><RequesterDashboard v-else />
  </WorkspaceLayout>
</template>
