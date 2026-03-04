import { useState, useCallback } from 'react';
import type { Entity } from 'fauxbase';
import type { UseAuthResult } from './types';
import { useFauxbaseContext } from './context';

export function useAuth<T extends Entity>(): UseAuthResult<T> {
  const ctx = useFauxbaseContext();
  const authService = ctx.client.auth;

  if (!authService) {
    throw new Error('useAuth requires auth to be configured in createClient');
  }

  const [, forceUpdate] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const rerender = useCallback(() => forceUpdate(n => n + 1), []);

  const login = useCallback(async (credentials: { email: string; password: string }): Promise<T> => {
    setLoading(true);
    setError(null);
    try {
      const user = await authService.login(credentials);
      rerender();
      return user;
    } catch (err) {
      const e = err instanceof Error ? err : new Error(String(err));
      setError(e);
      throw e;
    } finally {
      setLoading(false);
    }
  }, [authService, rerender]);

  const register = useCallback(async (data: Partial<T>): Promise<T> => {
    setLoading(true);
    setError(null);
    try {
      const user = await authService.register(data);
      rerender();
      return user;
    } catch (err) {
      const e = err instanceof Error ? err : new Error(String(err));
      setError(e);
      throw e;
    } finally {
      setLoading(false);
    }
  }, [authService, rerender]);

  const logout = useCallback(() => {
    authService.logout();
    rerender();
  }, [authService, rerender]);

  const hasRole = useCallback((role: string): boolean => {
    return authService.hasRole(role);
  }, [authService]);

  return {
    user: authService.currentUser as T | null,
    isLoggedIn: authService.isLoggedIn,
    token: authService.token,
    login,
    register,
    logout,
    hasRole,
    loading,
    error,
  };
}
