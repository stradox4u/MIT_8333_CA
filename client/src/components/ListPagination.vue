<script setup lang="ts">
import { computed } from "vue";
import { useRoute, type LocationQuery } from "vue-router";
import ChevronLeft from "~icons/lucide/chevron-left";
import ChevronRight from "~icons/lucide/chevron-right";

/** Links to the pages of a list whose page lives in the URL's `page`. */
const props = defineProps<{ page: number; pages: number }>();
const emit = defineEmits<{ navigate: [] }>();
const route = useRoute();

/** The current query at another page; page 1 leaves `page` out. */
function at(page: number) {
  const query: LocationQuery = { ...route.query };
  delete query.page;
  return { query: page > 1 ? { ...query, page: String(page) } : query };
}
/** The first, last and neighbouring pages, with gaps between. */
const entries = computed(() => {
  const numbers = [
    ...new Set(
      [1, props.page - 1, props.page, props.page + 1, props.pages].filter(
        (n) => n >= 1 && n <= props.pages,
      ),
    ),
  ].sort((a, b) => a - b);
  const list: ({ gap: true; key: string } | { gap: false; page: number })[] =
    [];
  numbers.forEach((page, index) => {
    if (index && page - numbers[index - 1] > 1)
      list.push({ gap: true, key: `gap-${page}` });
    list.push({ gap: false, page });
  });
  return list;
});
</script>
<template>
  <nav v-if="pages > 1" class="pagination" aria-label="Pagination">
    <RouterLink
      v-if="page > 1"
      :to="at(page - 1)"
      class="page-button page-step"
      :aria-current="undefined"
      @click="emit('navigate')"
      ><ChevronLeft class="icon" aria-hidden="true" />Previous</RouterLink
    ><span v-else class="page-button page-step disabled" aria-hidden="true"
      ><ChevronLeft class="icon" />Previous</span
    >
    <ul>
      <template v-for="entry in entries" :key="entry.gap ? entry.key : entry.page">
        <li v-if="entry.gap" class="page-gap" aria-hidden="true">…</li>
        <li v-else>
          <RouterLink
            :to="at(entry.page)"
            class="page-button page-number"
            :aria-label="`Page ${entry.page}`"
            :aria-current="entry.page === page ? 'page' : undefined"
            @click="emit('navigate')"
            >{{ entry.page }}</RouterLink
          >
        </li>
      </template>
    </ul>
    <span class="field-hint">Page {{ page }} of {{ pages }}</span>
    <RouterLink
      v-if="page < pages"
      :to="at(page + 1)"
      class="page-button page-step"
      :aria-current="undefined"
      @click="emit('navigate')"
      >Next<ChevronRight class="icon" aria-hidden="true"
    /></RouterLink>
    <span v-else class="page-button page-step disabled" aria-hidden="true"
      >Next<ChevronRight class="icon"
    /></span>
  </nav>
</template>
