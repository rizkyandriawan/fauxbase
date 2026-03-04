import { ref, watch, onMounted, onUnmounted } from 'vue';
import type { Service, Entity } from 'fauxbase';
import type { UseGetResult, UseGetOptions } from './types';
import { useFauxbaseContext } from './context';

export function useGet<T extends Entity>(
  service: Service<T>,
  id: string | null | undefined,
  options?: UseGetOptions,
): UseGetResult<T> {
  const ctx = useFauxbaseContext();
  const data = ref<T | null>(null) as UseGetResult<T>['data'];
  const loading = ref(true);
  const error = ref<Error | null>(null);
  let mounted = true;

  const enabled = options?.enabled !== false && id != null;

  const fetch = async () => {
    if (!enabled || !id) {
      data.value = null;
      loading.value = false;
      return;
    }
    loading.value = true;
    error.value = null;
    try {
      const result = await service.get(id);
      if (mounted) {
        data.value = result.data;
      }
    } catch (err) {
      if (mounted) {
        error.value = err instanceof Error ? err : new Error(String(err));
        data.value = null;
      }
    } finally {
      if (mounted) {
        loading.value = false;
      }
    }
  };

  // Subscribe for invalidation
  const unsub = ctx.subscribe(service, fetch);

  onMounted(() => {
    fetch();
  });

  onUnmounted(() => {
    mounted = false;
    unsub();
  });

  // Watch id changes
  watch(
    () => id,
    () => { fetch(); },
  );

  return { data, loading, error, refetch: fetch };
}
