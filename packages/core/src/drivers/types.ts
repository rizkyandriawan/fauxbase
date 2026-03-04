import type { ApiResponse, PagedResponse, QueryParams } from '../types';

export interface Driver {
  list<T>(resource: string, query: QueryParams): Promise<PagedResponse<T>>;
  get<T>(resource: string, id: string): Promise<ApiResponse<T>>;
  create<T>(resource: string, data: Partial<T>): Promise<ApiResponse<T>>;
  update<T>(resource: string, id: string, data: Partial<T>): Promise<ApiResponse<T>>;
  delete<T>(resource: string, id: string): Promise<ApiResponse<T>>;
  count(resource: string, filter?: Record<string, any>): Promise<number>;

  bulkCreate<T>(resource: string, data: Array<Partial<T>>): Promise<ApiResponse<T[]>>;
  bulkUpdate<T>(resource: string, updates: Array<{ id: string; data: Partial<T> }>): Promise<ApiResponse<T[]>>;
  bulkDelete(resource: string, ids: string[]): Promise<ApiResponse<{ count: number }>>;

  // Seed management
  seed(resource: string, data: Array<Record<string, any>>, entityClass: Function): void;
  getSeedVersion(): string | null;
  setSeedVersion(version: string): void;
  clear(resource: string): void;
}
