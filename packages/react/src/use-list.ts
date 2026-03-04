import { useState, useEffect, useCallback, useRef } from 'react';
import type { Service, Entity, QueryParams, PageMeta } from 'fauxbase';
import type { UseListResult, UseListOptions } from './types';
import { useFauxbaseContext } from './context';

export function useList<T extends Entity>(
  service: Service<T>,
  query?: QueryParams,
  options?: UseListOptions,
): UseListResult<T> {
  const ctx = useFauxbaseContext();
  const [items, setItems] = useState<T[]>([]);
  const [meta, setMeta] = useState<PageMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const mountedRef = useRef(true);

  const enabled = options?.enabled !== false;

  const fetch = useCallback(async () => {
    if (!enabled) return;
    setLoading(true);
    setError(null);
    try {
      const result = await service.list(query);
      if (mountedRef.current) {
        setItems(result.items);
        setMeta(result.meta);
      }
    } catch (err) {
      if (mountedRef.current) {
        setError(err instanceof Error ? err : new Error(String(err)));
      }
    } finally {
      if (mountedRef.current) {
        setLoading(false);
      }
    }
  }, [service, JSON.stringify(query), enabled]);

  // Subscribe for invalidation
  useEffect(() => {
    const unsub = ctx.subscribe(service, fetch);
    return unsub;
  }, [ctx, service, fetch]);

  // Fetch on mount and query change
  useEffect(() => {
    mountedRef.current = true;
    fetch();
    return () => { mountedRef.current = false; };
  }, [fetch]);

  // Refetch interval
  useEffect(() => {
    if (!options?.refetchInterval || !enabled) return;
    const id = setInterval(fetch, options.refetchInterval);
    return () => clearInterval(id);
  }, [fetch, options?.refetchInterval, enabled]);

  return { items, meta, loading, error, refetch: fetch };
}
