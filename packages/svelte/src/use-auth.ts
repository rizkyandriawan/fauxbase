import { writable } from 'svelte/store';
import type { Entity } from 'fauxbase';
import type { UseAuthResult } from './types';
import type { FauxbaseContextValue } from './types';
import { getFauxbaseContext } from './context';

export function useAuth<T extends Entity>(
  _ctx?: FauxbaseContextValue,
): UseAuthResult<T> {
  const ctx = _ctx ?? getFauxbaseContext();
  const authService = ctx.client.auth;

  if (!authService) {
    throw new Error('useAuth requires auth to be configured in createClient');
  }

  const user = writable<T | null>(authService.currentUser);
  const isLoggedIn = writable<boolean>(authService.isLoggedIn);
  const token = writable<string | null>(authService.token);
  const loading = writable(false);
  const error = writable<Error | null>(null);

  const syncState = () => {
    user.set(authService.currentUser);
    isLoggedIn.set(authService.isLoggedIn);
    token.set(authService.token);
  };

  const login = async (credentials: { email: string; password: string }): Promise<T> => {
    loading.set(true);
    error.set(null);
    try {
      const result = await authService.login(credentials);
      syncState();
      return result;
    } catch (err) {
      const e = err instanceof Error ? err : new Error(String(err));
      error.set(e);
      throw e;
    } finally {
      loading.set(false);
    }
  };

  const register = async (data: Partial<T>): Promise<T> => {
    loading.set(true);
    error.set(null);
    try {
      const result = await authService.register(data);
      syncState();
      return result;
    } catch (err) {
      const e = err instanceof Error ? err : new Error(String(err));
      error.set(e);
      throw e;
    } finally {
      loading.set(false);
    }
  };

  const logout = () => {
    authService.logout();
    syncState();
  };

  const hasRole = (role: string): boolean => {
    return authService.hasRole(role);
  };

  return {
    user: { subscribe: user.subscribe },
    isLoggedIn: { subscribe: isLoggedIn.subscribe },
    token: { subscribe: token.subscribe },
    login,
    register,
    logout,
    hasRole,
    loading: { subscribe: loading.subscribe },
    error: { subscribe: error.subscribe },
  };
}
