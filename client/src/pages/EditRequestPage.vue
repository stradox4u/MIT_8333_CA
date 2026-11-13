<script setup lang="ts">
import { useRoute } from "vue-router";
import ReportFaultPage from "./ReportFaultPage.vue";
const route = useRoute();
</script>
<template>
  <ReportFaultPage
    :key="String(route.params.reference)"
    :reference="String(route.params.reference)"
  />
</template>
