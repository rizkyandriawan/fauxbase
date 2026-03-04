import { writable } from 'svelte/store';
import { onDestroy } from 'svelte';
import type { Service, Entity } from 'fauxbase';
import type { UseGetResult, UseGetOptions } from './types';
import type { FauxbaseContextValue } from './types';
import { getFauxbaseContext } from './context';

export function useGet<T extends Entity>(
  service: Service<T>,
  id: string | null | undefined,
  options?: UseGetOptions,
  _ctx?: FauxbaseContextValue,
): UseGetResult<T> {
  const ctx = _ctx ?? getFauxbaseContext();
  const data = writable<T | null>(null);
  const loading = writable(true);
  const error = writable<Error | null>(null);
  let destroyed = false;

  const enabled = options?.enabled !== false && id != null;

  const fetch = async () => {
    if (!enabled || !id) {
      data.set(null);
      loading.set(false);
      return;
    }
    loading.set(true);
    error.set(null);
    try {
      const result = await service.get(id);
      if (!destroyed) {
        data.set(result.data);
      }
    } catch (err) {
      if (!destroyed) {
        error.set(err instanceof Error ? err : new Error(String(err)));
        data.set(null);
      }
    } finally {
      if (!destroyed) {
        loading.set(false);
      }
    }
  };

  // Subscribe for invalidation
  const unsub = ctx.subscribe(service, fetch);

  // Initial fetch
  fetch();

  try {
    onDestroy(() => {
      destroyed = true;
      unsub();
    });
  } catch {
    // Outside component context
  }

  const destroy = () => {
    destroyed = true;
    unsub();
  };

  return {
    data: { subscribe: data.subscribe },
    loading: { subscribe: loading.subscribe },
    error: { subscribe: error.subscribe },
    refetch: fetch,
    _destroy: destroy,
  } as UseGetResult<T> & { _destroy: () => void };
}
