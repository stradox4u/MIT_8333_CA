<template>
  <RouterView v-slot="{ Component }"
    ><component :is="Component" v-if="Component" />
    <main
      v-else
      class="min-h-svh grid place-items-center text-[14px]"
      role="status"
    >
      Checking your sign-in…
    </main></RouterView
  >
</template>
