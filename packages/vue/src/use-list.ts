import { ref, watch, onMounted, onUnmounted } from 'vue';
import type { Service, Entity, QueryParams, PageMeta } from 'fauxbase';
import type { UseListResult, UseListOptions } from './types';
import { useFauxbaseContext } from './context';

export function useList<T extends Entity>(
  service: Service<T>,
  query?: QueryParams,
  options?: UseListOptions,
): UseListResult<T> {
  const ctx = useFauxbaseContext();
  const items = ref<T[]>([]) as UseListResult<T>['items'];
  const meta = ref<PageMeta | null>(null) as UseListResult<T>['meta'];
  const loading = ref(true);
  const error = ref<Error | null>(null);
  let mounted = true;

  const enabled = options?.enabled !== false;

  const fetch = async () => {
    if (!enabled) return;
    loading.value = true;
    error.value = null;
    try {
      const result = await service.list(query);
      if (mounted) {
        items.value = result.items;
        meta.value = result.meta;
      }
    } catch (err) {
      if (mounted) {
        error.value = err instanceof Error ? err : new Error(String(err));
      }
    } finally {
      if (mounted) {
        loading.value = false;
      }
    }
  };

  // Subscribe for invalidation
  const unsub = ctx.subscribe(service, fetch);

  // Fetch on mount
  onMounted(() => {
    fetch();
  });

  // Refetch interval
  let intervalId: ReturnType<typeof setInterval> | undefined;
  if (options?.refetchInterval && enabled) {
    onMounted(() => {
      intervalId = setInterval(fetch, options.refetchInterval);
    });
  }

  onUnmounted(() => {
    mounted = false;
    unsub();
    if (intervalId) clearInterval(intervalId);
  });

  // Watch query changes
  watch(
    () => JSON.stringify(query),
    () => { fetch(); },
  );

  return { items, meta, loading, error, refetch: fetch };
}
