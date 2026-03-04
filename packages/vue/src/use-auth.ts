import { ref } from 'vue';
import type { Entity } from 'fauxbase';
import type { UseAuthResult } from './types';
import { useFauxbaseContext } from './context';

export function useAuth<T extends Entity>(): UseAuthResult<T> {
  const ctx = useFauxbaseContext();
  const authService = ctx.client.auth;

  if (!authService) {
    throw new Error('useAuth requires auth to be configured in createClient');
  }

  const tick = ref(0);
  const loading = ref(false);
  const error = ref<Error | null>(null);

  const rerender = () => { tick.value++; };

  const user = ref<T | null>(authService.currentUser) as UseAuthResult<T>['user'];
  const isLoggedIn = ref(authService.isLoggedIn);
  const token = ref<string | null>(authService.token);

  const syncState = () => {
    user.value = authService.currentUser;
    isLoggedIn.value = authService.isLoggedIn;
    token.value = authService.token;
    rerender();
  };

  const login = async (credentials: { email: string; password: string }): Promise<T> => {
    loading.value = true;
    error.value = null;
    try {
      const result = await authService.login(credentials);
      syncState();
      return result;
    } catch (err) {
      const e = err instanceof Error ? err : new Error(String(err));
      error.value = e;
      throw e;
    } finally {
      loading.value = false;
    }
  };

  const register = async (data: Partial<T>): Promise<T> => {
    loading.value = true;
    error.value = null;
    try {
      const result = await authService.register(data);
      syncState();
      return result;
    } catch (err) {
      const e = err instanceof Error ? err : new Error(String(err));
      error.value = e;
      throw e;
    } finally {
      loading.value = false;
    }
  };

  const logout = () => {
    authService.logout();
    syncState();
  };

  const hasRole = (role: string): boolean => {
    return authService.hasRole(role);
  };

  return { user, isLoggedIn, token, login, register, logout, hasRole, loading, error };
}
