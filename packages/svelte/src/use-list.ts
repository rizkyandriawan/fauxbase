import { writable } from 'svelte/store';
import { onDestroy } from 'svelte';
import type { Service, Entity, QueryParams, PageMeta } from 'fauxbase';
import type { UseListResult, UseListOptions } from './types';
import type { FauxbaseContextValue } from './types';
import { getFauxbaseContext } from './context';

export function useList<T extends Entity>(
  service: Service<T>,
  query?: QueryParams,
  options?: UseListOptions,
  _ctx?: FauxbaseContextValue,
): UseListResult<T> {
  const ctx = _ctx ?? getFauxbaseContext();
  const items = writable<T[]>([]);
  const meta = writable<PageMeta | null>(null);
  const loading = writable(true);
  const error = writable<Error | null>(null);
  let destroyed = false;

  const enabled = options?.enabled !== false;

  const fetch = async () => {
    if (!enabled) return;
    loading.set(true);
    error.set(null);
    try {
      const result = await service.list(query);
      if (!destroyed) {
        items.set(result.items);
        meta.set(result.meta);
      }
    } catch (err) {
      if (!destroyed) {
        error.set(err instanceof Error ? err : new Error(String(err)));
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

  // Refetch interval
  let intervalId: ReturnType<typeof setInterval> | undefined;
  if (options?.refetchInterval && enabled) {
    intervalId = setInterval(fetch, options.refetchInterval);
  }

  // Cleanup — try onDestroy but don't fail outside component context
  try {
    onDestroy(() => {
      destroyed = true;
      unsub();
      if (intervalId) clearInterval(intervalId);
    });
  } catch {
    // Outside component context (tests) — caller handles cleanup
  }

  const destroy = () => {
    destroyed = true;
    unsub();
    if (intervalId) clearInterval(intervalId);
  };

  return {
    items: { subscribe: items.subscribe },
    meta: { subscribe: meta.subscribe },
    loading: { subscribe: loading.subscribe },
    error: { subscribe: error.subscribe },
    refetch: fetch,
    _destroy: destroy,
  } as UseListResult<T> & { _destroy: () => void };
}
