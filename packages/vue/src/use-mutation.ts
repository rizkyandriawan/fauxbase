import { ref } from 'vue';
import type { Service, Entity } from 'fauxbase';
import type { UseMutationResult } from './types';
import { useFauxbaseContext } from './context';

export function useMutation<T extends Entity>(
  service: Service<T>,
): UseMutationResult<T> {
  const ctx = useFauxbaseContext();
  const loading = ref(false);
  const error = ref<Error | null>(null);

  const create = async (data: Partial<T>): Promise<T> => {
    loading.value = true;
    error.value = null;
    try {
      const result = await service.create(data);
      ctx.invalidate(service);
      return result.data;
    } catch (err) {
      const e = err instanceof Error ? err : new Error(String(err));
      error.value = e;
      throw e;
    } finally {
      loading.value = false;
    }
  };

  const update = async (id: string, data: Partial<T>): Promise<T> => {
    loading.value = true;
    error.value = null;
    try {
      const result = await service.update(id, data);
      ctx.invalidate(service);
      return result.data;
    } catch (err) {
      const e = err instanceof Error ? err : new Error(String(err));
      error.value = e;
      throw e;
    } finally {
      loading.value = false;
    }
  };

  const remove = async (id: string): Promise<T> => {
    loading.value = true;
    error.value = null;
    try {
      const result = await service.delete(id);
      ctx.invalidate(service);
      return result.data;
    } catch (err) {
      const e = err instanceof Error ? err : new Error(String(err));
      error.value = e;
      throw e;
    } finally {
      loading.value = false;
    }
  };

  return { create, update, remove, loading, error };
}
