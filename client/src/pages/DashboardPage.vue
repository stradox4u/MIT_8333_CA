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
    ><section
      class="mb-4.5 border border-campus-gray p-6 rounded-[13px] bg-campus-surface shadow-none phone:py-4.75 phone:px-3.75"
    >
      <p
        class="mt-0 mx-0 mb-4.25 text-[10px] font-semibold tracking-[0.16em] uppercase"
      >
        {{ roleName }} · MIT 8333 UNIVERSITY
      </p>
      <h1>Your campus workspace</h1>
      <p
        class="intro mt-0 mx-0 mb-6.5 text-[13px] leading-[1.7] text-campus-muted wrap-anywhere"
      >
        Welcome back, {{ me.data.value?.firstName }}. Help keep our university
        spaces working.
      </p>
      <RouterLink
        to="/account/settings"
        class="button inline-flex relative items-center justify-center gap-2.5 py-2.75 px-8.25 border border-campus-navy rounded-[7px] text-campus-navy text-[12px] font-semibold leading-normal text-center no-underline disabled:opacity-65 [&_.icon]:w-3.75 [&_.icon]:h-3.75 bg-campus-green enabled:hover:brightness-97 compact-button w-auto max-w-full min-h-10.5"
        >Open Account settings</RouterLink
      ><CampusArt class="mx-auto mt-8" /></section
  ></WorkspaceLayout>
</template>
