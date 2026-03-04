import type { Service, AuthService, Entity, QueryParams, PageMeta } from 'fauxbase';

// --- Hook result types ---

export interface UseListResult<T> {
  items: T[];
  meta: PageMeta | null;
  loading: boolean;
  error: Error | null;
  refetch: () => void;
}

export interface UseGetResult<T> {
  data: T | null;
  loading: boolean;
  error: Error | null;
  refetch: () => void;
}

export interface UseMutationResult<T> {
  create: (data: Partial<T>) => Promise<T>;
  update: (id: string, data: Partial<T>) => Promise<T>;
  remove: (id: string) => Promise<T>;
  loading: boolean;
  error: Error | null;
}

export interface UseAuthResult<T> {
  user: T | null;
  isLoggedIn: boolean;
  token: string | null;
  login: (credentials: { email: string; password: string }) => Promise<T>;
  register: (data: Partial<T>) => Promise<T>;
  logout: () => void;
  hasRole: (role: string) => boolean;
  loading: boolean;
  error: Error | null;
}

// --- Option types ---

export interface UseListOptions {
  enabled?: boolean;
  refetchInterval?: number;
}

export interface UseGetOptions {
  enabled?: boolean;
}

// --- Context types ---

export interface FauxbaseContextValue {
  client: any;
  invalidate: (service: Service<any>) => void;
  subscribe: (service: Service<any>, refetchFn: () => void) => () => void;
}
