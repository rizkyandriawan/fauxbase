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

// --- IndexedDB storage (memory-cached, write-through) ---

function idbRequest<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

const IDB_DATA_STORE = 'data';
const IDB_META_STORE = 'meta';

class IndexedDBBackend implements StorageBackend {
  private cache = new MemoryStorage();
  private db: IDBDatabase | null = null;
  private _ready: Promise<void>;

  constructor(dbName: string) {
    this._ready = this.open(dbName);
  }

  get ready(): Promise<void> {
    return this._ready;
  }

  private open(dbName: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(dbName, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(IDB_DATA_STORE)) {
          db.createObjectStore(IDB_DATA_STORE);
        }
        if (!db.objectStoreNames.contains(IDB_META_STORE)) {
          db.createObjectStore(IDB_META_STORE);
        }
      };
      req.onsuccess = async () => {
        this.db = req.result;
        await this.loadAll();
        resolve();
      };
      req.onerror = () => reject(req.error);
    });
  }

  private async loadAll(): Promise<void> {
    const db = this.db!;
    const tx = db.transaction([IDB_DATA_STORE, IDB_META_STORE], 'readonly');
    const dataStore = tx.objectStore(IDB_DATA_STORE);
    const metaStore = tx.objectStore(IDB_META_STORE);

    // Load all data keys
    const dataKeys = await idbRequest(dataStore.getAllKeys());
    const dataValues = await idbRequest(dataStore.getAll());
    for (let i = 0; i < dataKeys.length; i++) {
      const compositeKey = dataKeys[i] as string;
      const sepIdx = compositeKey.indexOf(':');
      const resource = compositeKey.substring(0, sepIdx);
      const id = compositeKey.substring(sepIdx + 1);
      this.cache.set(resource, id, dataValues[i]);
    }

    // Load all meta keys
    const metaKeys = await idbRequest(metaStore.getAllKeys());
    const metaValues = await idbRequest(metaStore.getAll());
    for (let i = 0; i < metaKeys.length; i++) {
      this.cache.setMeta(metaKeys[i] as string, metaValues[i]);
    }
  }

  private writeData(resource: string, id: string, data: Record<string, any>): void {
    if (!this.db) return;
    const tx = this.db.transaction(IDB_DATA_STORE, 'readwrite');
    tx.objectStore(IDB_DATA_STORE).put(data, `${resource}:${id}`);
  }

  private deleteData(resource: string, id: string): void {
    if (!this.db) return;
    const tx = this.db.transaction(IDB_DATA_STORE, 'readwrite');
    tx.objectStore(IDB_DATA_STORE).delete(`${resource}:${id}`);
  }

  private writeMeta(key: string, value: string): void {
    if (!this.db) return;
    const tx = this.db.transaction(IDB_META_STORE, 'readwrite');
    tx.objectStore(IDB_META_STORE).put(value, key);
  }

  getAll(resource: string): Record<string, any>[] {
    return this.cache.getAll(resource);
  }

  getById(resource: string, id: string): Record<string, any> | undefined {
    return this.cache.getById(resource, id);
  }

  set(resource: string, id: string, data: Record<string, any>): void {
    this.cache.set(resource, id, data);
    this.writeData(resource, id, data);
  }

  remove(resource: string, id: string): void {
    this.cache.remove(resource, id);
    this.deleteData(resource, id);
  }

  clear(resource: string): void {
    const items = this.cache.getAll(resource);
    this.cache.clear(resource);
    if (this.db) {
      const tx = this.db.transaction(IDB_DATA_STORE, 'readwrite');
      const store = tx.objectStore(IDB_DATA_STORE);
      for (const item of items) {
        store.delete(`${resource}:${item.id}`);
      }
    }
  }

  getMeta(key: string): string | null {
    return this.cache.getMeta(key);
  }

  setMeta(key: string, value: string): void {
    this.cache.setMeta(key, value);
    this.writeMeta(key, value);
  }
}

// --- Auth provider type ---

type AuthProvider = () => { userId: string; userName?: string } | null;

// --- LocalDriver ---

export class LocalDriver implements Driver {
  private storage: StorageBackend;
  private entityClasses = new Map<string, Function>();
  private authProvider: AuthProvider | null = null;
  private _ready: Promise<void>;
  private _isReady: boolean;

  constructor(config: LocalDriverConfig) {
    if (config.persist === 'indexeddb') {
      const backend = new IndexedDBBackend(config.dbName ?? 'fauxbase');
      this.storage = backend;
      this._isReady = false;
      this._ready = backend.ready.then(() => { this._isReady = true; });
    } else {
      this.storage = config.persist === 'localStorage'
        ? new LocalStorageBackend()
        : new MemoryStorage();
      this._isReady = true;
      this._ready = Promise.resolve();
    }
  }

  get ready(): Promise<void> {
    return this._ready;
  }

  get isReady(): boolean {
    return this._isReady;
  }

  setAuthProvider(provider: AuthProvider): void {
    this.authProvider = provider;
  }

  getStorageBackend(): StorageBackend {
    return this.storage;
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

    const authContext = this.authProvider?.();

    let record: Record<string, any> = {
      ...data,
      id: (data as any).id || generateUUID(),
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
      version: 1,
      ...(authContext ? {
        createdById: authContext.userId,
        createdByName: authContext.userName,
        updatedById: authContext.userId,
        updatedByName: authContext.userName,
      } : {}),
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

    const authContext = this.authProvider?.();

    const record: Record<string, any> = {
      ...existing,
      ...data,
      id,
      createdAt: existing.createdAt,
      updatedAt: new Date().toISOString(),
      version: (existing.version || 0) + 1,
      ...(authContext ? {
        updatedById: authContext.userId,
        updatedByName: authContext.userName,
      } : {}),
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
    const authContext = this.authProvider?.();

    const record = {
      ...existing,
      deletedAt: now,
      updatedAt: now,
      version: (existing.version || 0) + 1,
      ...(authContext ? {
        deletedById: authContext.userId,
        deletedByName: authContext.userName,
        updatedById: authContext.userId,
        updatedByName: authContext.userName,
      } : {}),
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

  async request<R = any>(
    _resource: string,
    _path: string,
    options?: { method?: string; body?: any; query?: Record<string, string>; local?: () => R | Promise<R> },
  ): Promise<R> {
    if (options?.local) {
      return options.local();
    }
    throw new Error(
      'service.request() is only available with the HTTP driver. ' +
      'Provide a `local` handler or switch to HTTP driver.',
    );
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
