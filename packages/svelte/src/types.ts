import type { Readable } from 'svelte/store';
import type { Service, Entity, PageMeta } from 'fauxbase';

// --- Store result types ---

export interface UseListResult<T> {
  items: Readable<T[]>;
  meta: Readable<PageMeta | null>;
  loading: Readable<boolean>;
  error: Readable<Error | null>;
  refetch: () => void;
}

export interface UseGetResult<T> {
  data: Readable<T | null>;
  loading: Readable<boolean>;
  error: Readable<Error | null>;
  refetch: () => void;
}

export interface UseMutationResult<T> {
  create: (data: Partial<T>) => Promise<T>;
  update: (id: string, data: Partial<T>) => Promise<T>;
  remove: (id: string) => Promise<T>;
  loading: Readable<boolean>;
  error: Readable<Error | null>;
}

export interface UseAuthResult<T> {
  user: Readable<T | null>;
  isLoggedIn: Readable<boolean>;
  token: Readable<string | null>;
  login: (credentials: { email: string; password: string }) => Promise<T>;
  register: (data: Partial<T>) => Promise<T>;
  logout: () => void;
  hasRole: (role: string) => boolean;
  loading: Readable<boolean>;
  error: Readable<Error | null>;
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
