<template>
  <RouterView v-slot="{ Component }"
    ><component :is="Component" v-if="Component" />
    <main v-else class="bootstrap" role="status">
      Checking your sign-in…
    </main></RouterView
  >
</template>
