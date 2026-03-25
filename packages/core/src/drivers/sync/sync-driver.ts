import type { ApiResponse, PagedResponse, QueryParams } from '../../types';
import type { Driver } from '../types';
import { LocalDriver } from '../local';
import { HttpDriver } from '../http';
import { SyncQueue } from './sync-queue';
import { SyncEngine } from './sync-engine';
import type { SyncDriverConfig } from './types';

type AuthProvider = () => { token: string } | null;

export class SyncDriver implements Driver {
  private localDriver: LocalDriver;
  private httpDriver: HttpDriver;
  private queue: SyncQueue;
  private _syncEngine: SyncEngine;
  private _ready: Promise<void>;
  private _isReady = false;

  constructor(config: SyncDriverConfig) {
    this.localDriver = new LocalDriver({
      type: 'local',
      persist: config.local.persist ?? 'indexeddb',
      dbName: config.local.dbName,
    });

    this.httpDriver = new HttpDriver({
      type: 'http',
      baseUrl: config.remote.baseUrl,
      preset: config.remote.preset,
      timeout: config.remote.timeout,
      retry: config.remote.retry,
      headers: config.remote.headers,
    });

    this.queue = new SyncQueue(
      config.local.dbName ? `${config.local.dbName}-sync-queue` : undefined,
    );

    this._syncEngine = new SyncEngine(
      this.localDriver,
      this.httpDriver,
      this.queue,
      config.sync,
    );

    this._ready = Promise.all([this.localDriver.ready, this.queue.ready]).then(() => {
      this._isReady = true;
    });
  }

  get ready(): Promise<void> {
    return this._ready;
  }

  get isReady(): boolean {
    return this._isReady;
  }

  get syncEngine(): SyncEngine {
    return this._syncEngine;
  }

  /** @internal — exposed for createClient auth wiring */
  get _httpDriver(): HttpDriver {
    return this.httpDriver;
  }

  // --- Reads: delegate to local ---

  async list<T>(resource: string, query: QueryParams): Promise<PagedResponse<T>> {
    return this.localDriver.list<T>(resource, query);
  }

  async get<T>(resource: string, id: string): Promise<ApiResponse<T>> {
    return this.localDriver.get<T>(resource, id);
  }

  async count(resource: string, filter?: Record<string, any>): Promise<number> {
    return this.localDriver.count(resource, filter);
  }

  // --- Writes: local first, then enqueue ---

  async create<T>(resource: string, data: Partial<T>): Promise<ApiResponse<T>> {
    const result = await this.localDriver.create<T>(resource, data);
    await this.queue.enqueue({
      resource,
      action: 'create',
      entityId: (result.data as any).id,
      data: result.data as any,
      timestamp: Date.now(),
    });
    return result;
  }

  async update<T>(resource: string, id: string, data: Partial<T>): Promise<ApiResponse<T>> {
    const result = await this.localDriver.update<T>(resource, id, data);
    await this.queue.enqueue({
      resource,
      action: 'update',
      entityId: id,
      data: data as Record<string, any>,
      timestamp: Date.now(),
    });
    return result;
  }

  async delete<T>(resource: string, id: string): Promise<ApiResponse<T>> {
    const result = await this.localDriver.delete<T>(resource, id);
    await this.queue.enqueue({
      resource,
      action: 'delete',
      entityId: id,
      data: null,
      timestamp: Date.now(),
    });
    return result;
  }

  // --- Bulk: delegate to local + enqueue each ---

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
    for (const id of ids) {
      await this.delete(resource, id);
    }
    return { data: { count: ids.length } };
  }

  // --- Custom request: local handler offline, HTTP when online ---

  async request<R = any>(
    resource: string,
    path: string,
    options?: { method?: string; body?: any; query?: Record<string, string>; local?: () => R | Promise<R> },
  ): Promise<R> {
    try {
      return await this.httpDriver.request<R>(resource, path, options);
    } catch {
      if (options?.local) {
        return options.local();
      }
      throw new Error(
        'service.request() failed and no local handler provided. ' +
        'Provide a `local` callback for offline support.',
      );
    }
  }

  // --- Seed/meta: delegate to local ---

  seed(resource: string, data: Array<Record<string, any>>, entityClass: Function): void {
    this.localDriver.seed(resource, data, entityClass);
  }

  getSeedVersion(): string | null {
    return this.localDriver.getSeedVersion();
  }

  setSeedVersion(version: string): void {
    this.localDriver.setSeedVersion(version);
  }

  clear(resource: string): void {
    this.localDriver.clear(resource);
  }

  // --- Wiring methods (called by createClient) ---

  setAuthProvider(provider: AuthProvider): void {
    this.httpDriver.setAuthProvider(provider);
    // Local driver auth uses a different shape — wire it for createdById injection
    this.localDriver.setAuthProvider(() => {
      const auth = provider();
      if (!auth) return null;
      // Decode token to get userId (best effort)
      try {
        const payload = JSON.parse(atob(auth.token));
        return { userId: payload.userId, userName: payload.email };
      } catch {
        return null;
      }
    });
  }

  setOnUnauthorized(handler: () => Promise<boolean>): void {
    this.httpDriver.setOnUnauthorized(handler);
  }

  registerEndpoint(resource: string, endpoint: string): void {
    this.httpDriver.registerEndpoint(resource, endpoint);
    this._syncEngine.registerResource(resource, endpoint);
  }

  registerEntity(resource: string, entityClass: Function): void {
    this.localDriver.registerEntity(resource, entityClass);
  }

  getStorageBackend(): ReturnType<LocalDriver['getStorageBackend']> {
    return this.localDriver.getStorageBackend();
  }
}
