import { useState, useEffect, useCallback, useRef } from 'react';
import type { Service, Entity } from 'fauxbase';
import type { UseGetResult, UseGetOptions } from './types';
import { useFauxbaseContext } from './context';

export function useGet<T extends Entity>(
  service: Service<T>,
  id: string | null | undefined,
  options?: UseGetOptions,
): UseGetResult<T> {
  const ctx = useFauxbaseContext();
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const mountedRef = useRef(true);

  const enabled = options?.enabled !== false && id != null;

  const fetch = useCallback(async () => {
    if (!enabled || !id) {
      setData(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const result = await service.get(id);
      if (mountedRef.current) {
        setData(result.data);
      }
    } catch (err) {
      if (mountedRef.current) {
        setError(err instanceof Error ? err : new Error(String(err)));
        setData(null);
      }
    } finally {
      if (mountedRef.current) {
        setLoading(false);
      }
    }
  }, [service, id, enabled]);

  // Subscribe for invalidation
  useEffect(() => {
    const unsub = ctx.subscribe(service, fetch);
    return unsub;
  }, [ctx, service, fetch]);

  // Fetch on mount and id change
  useEffect(() => {
    mountedRef.current = true;
    fetch();
    return () => { mountedRef.current = false; };
  }, [fetch]);

  return { data, loading, error, refetch: fetch };
}
