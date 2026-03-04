import { writable } from 'svelte/store';
import type { Service, Entity } from 'fauxbase';
import type { UseMutationResult } from './types';
import type { FauxbaseContextValue } from './types';
import { getFauxbaseContext } from './context';

export function useMutation<T extends Entity>(
  service: Service<T>,
  _ctx?: FauxbaseContextValue,
): UseMutationResult<T> {
  const ctx = _ctx ?? getFauxbaseContext();
  const loading = writable(false);
  const error = writable<Error | null>(null);

  const create = async (data: Partial<T>): Promise<T> => {
    loading.set(true);
    error.set(null);
    try {
      const result = await service.create(data);
      ctx.invalidate(service);
      return result.data;
    } catch (err) {
      const e = err instanceof Error ? err : new Error(String(err));
      error.set(e);
      throw e;
    } finally {
      loading.set(false);
    }
  };

  const update = async (id: string, data: Partial<T>): Promise<T> => {
    loading.set(true);
    error.set(null);
    try {
      const result = await service.update(id, data);
      ctx.invalidate(service);
      return result.data;
    } catch (err) {
      const e = err instanceof Error ? err : new Error(String(err));
      error.set(e);
      throw e;
    } finally {
      loading.set(false);
    }
  };

  const remove = async (id: string): Promise<T> => {
    loading.set(true);
    error.set(null);
    try {
      const result = await service.delete(id);
      ctx.invalidate(service);
      return result.data;
    } catch (err) {
      const e = err instanceof Error ? err : new Error(String(err));
      error.set(e);
      throw e;
    } finally {
      loading.set(false);
    }
  };

  return {
    create,
    update,
    remove,
    loading: { subscribe: loading.subscribe },
    error: { subscribe: error.subscribe },
  };
}
