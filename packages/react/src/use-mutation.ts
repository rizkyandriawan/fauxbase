import { useState, useCallback } from 'react';
import type { Service, Entity } from 'fauxbase';
import type { UseMutationResult } from './types';
import { useFauxbaseContext } from './context';

export function useMutation<T extends Entity>(
  service: Service<T>,
): UseMutationResult<T> {
  const ctx = useFauxbaseContext();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const create = useCallback(async (data: Partial<T>): Promise<T> => {
    setLoading(true);
    setError(null);
    try {
      const result = await service.create(data);
      ctx.invalidate(service);
      return result.data;
    } catch (err) {
      const e = err instanceof Error ? err : new Error(String(err));
      setError(e);
      throw e;
    } finally {
      setLoading(false);
    }
  }, [service, ctx]);

  const update = useCallback(async (id: string, data: Partial<T>): Promise<T> => {
    setLoading(true);
    setError(null);
    try {
      const result = await service.update(id, data);
      ctx.invalidate(service);
      return result.data;
    } catch (err) {
      const e = err instanceof Error ? err : new Error(String(err));
      setError(e);
      throw e;
    } finally {
      setLoading(false);
    }
  }, [service, ctx]);

  const remove = useCallback(async (id: string): Promise<T> => {
    setLoading(true);
    setError(null);
    try {
      const result = await service.delete(id);
      ctx.invalidate(service);
      return result.data;
    } catch (err) {
      const e = err instanceof Error ? err : new Error(String(err));
      setError(e);
      throw e;
    } finally {
      setLoading(false);
    }
  }, [service, ctx]);

  return { create, update, remove, loading, error };
}
