import type { Ref } from 'vue';
import type { Service, Entity, PageMeta } from 'fauxbase';

// --- Hook result types ---

export interface UseListResult<T> {
  items: Ref<T[]>;
  meta: Ref<PageMeta | null>;
  loading: Ref<boolean>;
  error: Ref<Error | null>;
  refetch: () => void;
}

export interface UseGetResult<T> {
  data: Ref<T | null>;
  loading: Ref<boolean>;
  error: Ref<Error | null>;
  refetch: () => void;
}

export interface UseMutationResult<T> {
  create: (data: Partial<T>) => Promise<T>;
  update: (id: string, data: Partial<T>) => Promise<T>;
  remove: (id: string) => Promise<T>;
  loading: Ref<boolean>;
  error: Ref<Error | null>;
}

export interface UseAuthResult<T> {
  user: Ref<T | null>;
  isLoggedIn: Ref<boolean>;
  token: Ref<string | null>;
  login: (credentials: { email: string; password: string }) => Promise<T>;
  register: (data: Partial<T>) => Promise<T>;
  logout: () => void;
  hasRole: (role: string) => boolean;
  loading: Ref<boolean>;
  error: Ref<Error | null>;
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
