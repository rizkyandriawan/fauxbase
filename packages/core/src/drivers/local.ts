import type { ApiResponse, LocalDriverConfig, PagedResponse, QueryParams } from '../types';
import type { Driver } from './types';
import { executeQuery, applyFilters } from '../query-engine';
import { applyComputedFields, applyDefaults, validateEntity } from '../entity';
import { NotFoundError } from '../errors';

// --- UUID generation ---

function generateUUID(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

// --- Storage backend interface ---

interface StorageBackend {
  getAll(resource: string): Record<string, any>[];
  getById(resource: string, id: string): Record<string, any> | undefined;
  set(resource: string, id: string, data: Record<string, any>): void;
  remove(resource: string, id: string): void;
  clear(resource: string): void;
  getMeta(key: string): string | null;
  setMeta(key: string, value: string): void;
}

// --- Memory storage ---

class MemoryStorage implements StorageBackend {
  private data = new Map<string, Map<string, Record<string, any>>>();
  private meta = new Map<string, string>();

  getAll(resource: string): Record<string, any>[] {
    const store = this.data.get(resource);
    return store ? Array.from(store.values()) : [];
  }

  getById(resource: string, id: string): Record<string, any> | undefined {
    return this.data.get(resource)?.get(id);
  }

  set(resource: string, id: string, data: Record<string, any>): void {
    if (!this.data.has(resource)) this.data.set(resource, new Map());
    this.data.get(resource)!.set(id, data);
  }

  remove(resource: string, id: string): void {
    this.data.get(resource)?.delete(id);
  }

  clear(resource: string): void {
    this.data.delete(resource);
  }

  getMeta(key: string): string | null {
    return this.meta.get(key) ?? null;
  }

  setMeta(key: string, value: string): void {
    this.meta.set(key, value);
  }
}

// --- localStorage storage ---

const LS_PREFIX = 'fauxbase:';
const LS_INDEX_PREFIX = `${LS_PREFIX}__index:`;
const LS_META_PREFIX = `${LS_PREFIX}__meta:`;

class LocalStorageBackend implements StorageBackend {
  private getIndex(resource: string): string[] {
    const raw = localStorage.getItem(`${LS_INDEX_PREFIX}${resource}`);
    return raw ? JSON.parse(raw) : [];
  }

  private setIndex(resource: string, ids: string[]): void {
    localStorage.setItem(`${LS_INDEX_PREFIX}${resource}`, JSON.stringify(ids));
  }

  getAll(resource: string): Record<string, any>[] {
    const ids = this.getIndex(resource);
    const items: Record<string, any>[] = [];
    for (const id of ids) {
      const raw = localStorage.getItem(`${LS_PREFIX}${resource}:${id}`);
      if (raw) items.push(JSON.parse(raw));
    }
    return items;
  }

  getById(resource: string, id: string): Record<string, any> | undefined {
    const raw = localStorage.getItem(`${LS_PREFIX}${resource}:${id}`);
    return raw ? JSON.parse(raw) : undefined;
  }

  set(resource: string, id: string, data: Record<string, any>): void {
    localStorage.setItem(`${LS_PREFIX}${resource}:${id}`, JSON.stringify(data));
    const ids = this.getIndex(resource);
    if (!ids.includes(id)) {
      ids.push(id);
      this.setIndex(resource, ids);
    }
  }

  remove(resource: string, id: string): void {
    localStorage.removeItem(`${LS_PREFIX}${resource}:${id}`);
    const ids = this.getIndex(resource);
    this.setIndex(resource, ids.filter(i => i !== id));
  }

  clear(resource: string): void {
    const ids = this.getIndex(resource);
    for (const id of ids) {
      localStorage.removeItem(`${LS_PREFIX}${resource}:${id}`);
    }
    localStorage.removeItem(`${LS_INDEX_PREFIX}${resource}`);
  }

  getMeta(key: string): string | null {
    return localStorage.getItem(`${LS_META_PREFIX}${key}`);
  }

  setMeta(key: string, value: string): void {
    localStorage.setItem(`${LS_META_PREFIX}${key}`, value);
  }
}

// --- LocalDriver ---

export class LocalDriver implements Driver {
  private storage: StorageBackend;
  private entityClasses = new Map<string, Function>();

  constructor(config: LocalDriverConfig) {
    this.storage = config.persist === 'localStorage'
      ? new LocalStorageBackend()
      : new MemoryStorage();
  }

  registerEntity(resource: string, entityClass: Function): void {
    this.entityClasses.set(resource, entityClass);
  }

  async list<T>(resource: string, query: QueryParams): Promise<PagedResponse<T>> {
    const items = this.storage.getAll(resource);
    const entityClass = this.entityClasses.get(resource);
    const processed = entityClass
      ? items.map(item => applyComputedFields<T>(item, entityClass))
      : items;
    return executeQuery(processed as Record<string, any>[], query) as PagedResponse<T>;
  }

  async get<T>(resource: string, id: string): Promise<ApiResponse<T>> {
    const item = this.storage.getById(resource, id);
    if (!item || item.deletedAt) {
      throw new NotFoundError(`${resource} with id "${id}" not found`);
    }
    const entityClass = this.entityClasses.get(resource);
    const data = entityClass ? applyComputedFields<T>(item, entityClass) : item as T;
    return { data };
  }

  async create<T>(resource: string, data: Partial<T>): Promise<ApiResponse<T>> {
    const entityClass = this.entityClasses.get(resource);
    const now = new Date().toISOString();

    let record: Record<string, any> = {
      ...data,
      id: (data as any).id || generateUUID(),
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
      version: 1,
    };

    if (entityClass) {
      record = applyDefaults(record, entityClass);
      validateEntity(record, entityClass, true);
    }

    this.storage.set(resource, record.id, record);

    const result = entityClass
      ? applyComputedFields<T>(record, entityClass)
      : record as T;
    return { data: result };
  }

  async update<T>(resource: string, id: string, data: Partial<T>): Promise<ApiResponse<T>> {
    const existing = this.storage.getById(resource, id);
    if (!existing || existing.deletedAt) {
      throw new NotFoundError(`${resource} with id "${id}" not found`);
    }

    const entityClass = this.entityClasses.get(resource);
    if (entityClass) {
      validateEntity(data as Record<string, any>, entityClass, false);
    }

    const record: Record<string, any> = {
      ...existing,
      ...data,
      id,
      createdAt: existing.createdAt,
      updatedAt: new Date().toISOString(),
      version: (existing.version || 0) + 1,
    };

    this.storage.set(resource, id, record);

    const result = entityClass
      ? applyComputedFields<T>(record, entityClass)
      : record as T;
    return { data: result };
  }

  async delete<T>(resource: string, id: string): Promise<ApiResponse<T>> {
    const existing = this.storage.getById(resource, id);
    if (!existing || existing.deletedAt) {
      throw new NotFoundError(`${resource} with id "${id}" not found`);
    }

    const now = new Date().toISOString();
    const record = {
      ...existing,
      deletedAt: now,
      updatedAt: now,
      version: (existing.version || 0) + 1,
    };

    this.storage.set(resource, id, record);
    return { data: record as T };
  }

  async count(resource: string, filter?: Record<string, any>): Promise<number> {
    let items = this.storage.getAll(resource).filter(item => !item.deletedAt);
    if (filter) {
      items = applyFilters(items, filter);
    }
    return items.length;
  }

  async bulkCreate<T>(resource: string, data: Array<Partial<T>>): Promise<ApiResponse<T[]>> {
    const results: T[] = [];
    for (const item of data) {
      const { data: created } = await this.create<T>(resource, item);
      results.push(created);
    }
    return { data: results };
  }

  async bulkUpdate<T>(resource: string, updates: Array<{ id: string; data: Partial<T> }>): Promise<ApiResponse<T[]>> {
    const results: T[] = [];
    for (const { id, data } of updates) {
      const { data: updated } = await this.update<T>(resource, id, data);
      results.push(updated);
    }
    return { data: results };
  }

  async bulkDelete(resource: string, ids: string[]): Promise<ApiResponse<{ count: number }>> {
    let count = 0;
    for (const id of ids) {
      await this.delete(resource, id);
      count++;
    }
    return { data: { count } };
  }

  // --- Seed management (synchronous) ---

  seed(resource: string, data: Array<Record<string, any>>, entityClass: Function): void {
    for (let i = 0; i < data.length; i++) {
      const seedId = `seed:${resource}:${i}`;
      const now = new Date().toISOString();
      const record = applyDefaults({
        ...data[i],
        id: seedId,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
        version: 1,
      }, entityClass);
      this.storage.set(resource, seedId, record);
    }
  }

  getSeedVersion(): string | null {
    return this.storage.getMeta('_seedVersion');
  }

  setSeedVersion(version: string): void {
    this.storage.setMeta('_seedVersion', version);
  }

  clear(resource: string): void {
    this.storage.clear(resource);
  }
}
