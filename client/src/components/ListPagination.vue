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
  <nav
    v-if="pages > 1"
    class="flex flex-wrap items-center gap-2 mt-3.5 [&_ul]:flex [&_ul]:flex-wrap [&_ul]:gap-1 [&_ul]:m-0 [&_ul]:p-0 [&_ul]:list-none phone:[&_.page-number:not([aria-current='page'])]:hidden"
    aria-label="Pagination"
  >
    <RouterLink
      v-if="page > 1"
      :to="at(page - 1)"
      class="inline-flex items-center justify-center gap-1 min-w-9 h-9 py-0 px-2 border border-campus-control rounded-[7px] bg-campus-surface text-campus-navy text-[12px] tabular-nums no-underline aria-[current=page]:border-campus-navy aria-[current=page]:bg-campus-navy aria-[current=page]:text-campus-surface aria-[current=page]:font-[650] [&.disabled]:opacity-50 phone:min-w-11 phone:h-11 page-step"
      :aria-current="undefined"
      @click="emit('navigate')"
      ><ChevronLeft
        class="icon inline-block w-4 h-4 flex-none align-[-3px]"
        aria-hidden="true"
      />Previous</RouterLink
    ><span
      v-else
      class="inline-flex items-center justify-center gap-1 min-w-9 h-9 py-0 px-2 border border-campus-control rounded-[7px] bg-campus-surface text-campus-navy text-[12px] tabular-nums no-underline aria-[current=page]:border-campus-navy aria-[current=page]:bg-campus-navy aria-[current=page]:text-campus-surface aria-[current=page]:font-[650] [&.disabled]:opacity-50 phone:min-w-11 phone:h-11 page-step disabled"
      aria-hidden="true"
      ><ChevronLeft
        class="icon inline-block w-4 h-4 flex-none align-[-3px]"
      />Previous</span
    >
    <ul>
      <template
        v-for="entry in entries"
        :key="entry.gap ? entry.key : entry.page"
      >
        <li
          v-if="entry.gap"
          class="grid place-items-center w-5.5 text-campus-muted phone:hidden"
          aria-hidden="true"
        >
          …
        </li>
        <li v-else>
          <RouterLink
            :to="at(entry.page)"
            class="inline-flex items-center justify-center gap-1 min-w-9 h-9 py-0 px-2 border border-campus-control rounded-[7px] bg-campus-surface text-campus-navy text-[12px] tabular-nums no-underline aria-[current=page]:border-campus-navy aria-[current=page]:bg-campus-navy aria-[current=page]:text-campus-surface aria-[current=page]:font-[650] [&.disabled]:opacity-50 phone:min-w-11 phone:h-11 page-number"
            :aria-label="`Page ${entry.page}`"
            :aria-current="entry.page === page ? 'page' : undefined"
            @click="emit('navigate')"
            >{{ entry.page }}</RouterLink
          >
        </li>
      </template>
    </ul>
    <span
      class="m-0 text-campus-muted text-[11px] leading-[1.65] order-9 ml-auto"
      >Page {{ page }} of {{ pages }}</span
    >
    <RouterLink
      v-if="page < pages"
      :to="at(page + 1)"
      class="inline-flex items-center justify-center gap-1 min-w-9 h-9 py-0 px-2 border border-campus-control rounded-[7px] bg-campus-surface text-campus-navy text-[12px] tabular-nums no-underline aria-[current=page]:border-campus-navy aria-[current=page]:bg-campus-navy aria-[current=page]:text-campus-surface aria-[current=page]:font-[650] [&.disabled]:opacity-50 phone:min-w-11 phone:h-11 page-step"
      :aria-current="undefined"
      @click="emit('navigate')"
      >Next<ChevronRight
        class="icon inline-block w-4 h-4 flex-none align-[-3px]"
        aria-hidden="true"
    /></RouterLink>
    <span
      v-else
      class="inline-flex items-center justify-center gap-1 min-w-9 h-9 py-0 px-2 border border-campus-control rounded-[7px] bg-campus-surface text-campus-navy text-[12px] tabular-nums no-underline aria-[current=page]:border-campus-navy aria-[current=page]:bg-campus-navy aria-[current=page]:text-campus-surface aria-[current=page]:font-[650] [&.disabled]:opacity-50 phone:min-w-11 phone:h-11 page-step disabled"
      aria-hidden="true"
      >Next<ChevronRight
        class="icon inline-block w-4 h-4 flex-none align-[-3px]"
    /></span>
  </nav>
</template>
