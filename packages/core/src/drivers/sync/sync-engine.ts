import type { LocalDriver } from '../local';
import type { HttpDriver } from '../http';
import type { EventBus } from '../../events/event-bus';
import type { SyncQueue } from './sync-queue';
import type { SyncDriverConfig, SyncState } from './types';

interface SyncConfig {
  interval: number;
  retryDelay: number;
  maxRetries: number;
  conflictStrategy: 'last-write-wins' | 'server-wins' | 'client-wins';
  resources: string[] | null;
  pingUrl: string;
}

export class SyncEngine {
  private localDriver: LocalDriver;
  private httpDriver: HttpDriver;
  private queue: SyncQueue;
  private config: SyncConfig;
  private eventBus: EventBus | null = null;
  private online = true;
  private syncing = false;
  private pullTimer: ReturnType<typeof setInterval> | null = null;
  private pushTimer: ReturnType<typeof setTimeout> | null = null;
  private lastSynced: number | null = null;
  private registeredResources = new Map<string, string>(); // resource -> endpoint
  private _syncPromise: Promise<{ pushed: number; pulled: number }> | null = null;

  constructor(
    localDriver: LocalDriver,
    httpDriver: HttpDriver,
    queue: SyncQueue,
    syncConfig?: SyncDriverConfig['sync'],
  ) {
    this.localDriver = localDriver;
    this.httpDriver = httpDriver;
    this.queue = queue;
    this.config = {
      interval: syncConfig?.interval ?? 30000,
      retryDelay: syncConfig?.retryDelay ?? 5000,
      maxRetries: syncConfig?.maxRetries ?? 10,
      conflictStrategy: syncConfig?.conflictStrategy ?? 'last-write-wins',
      resources: syncConfig?.resources ?? null,
      pingUrl: syncConfig?.pingUrl ?? '/ping',
    };
  }

  setEventBus(bus: EventBus): void {
    this.eventBus = bus;
  }

  registerResource(resource: string, endpoint: string): void {
    this.registeredResources.set(resource, endpoint);
  }

  start(): void {
    this.setupConnectivityListeners();

    // Start sync loop
    if (this.config.interval > 0) {
      this.pullTimer = setInterval(() => {
        this.sync().catch(() => {});
      }, this.config.interval);
    }

    // Initial sync
    this.sync().catch(() => {});
  }

  stop(): void {
    if (this.pullTimer) {
      clearInterval(this.pullTimer);
      this.pullTimer = null;
    }
    if (this.pushTimer) {
      clearTimeout(this.pushTimer);
      this.pushTimer = null;
    }
  }

  async sync(): Promise<{ pushed: number; pulled: number }> {
    // Dedupe concurrent sync calls
    if (this._syncPromise) return this._syncPromise;

    this._syncPromise = this._doSync();
    try {
      return await this._syncPromise;
    } finally {
      this._syncPromise = null;
    }
  }

  private async _doSync(): Promise<{ pushed: number; pulled: number }> {
    if (this.syncing) return { pushed: 0, pulled: 0 };
    this.syncing = true;
    this.emitSyncState();

    this.emitEvent('sync:start');

    let pushed = 0;
    let pulled = 0;

    try {
      // Check connectivity first
      this.online = await this.checkOnline();
      if (!this.online) {
        this.emitEvent('sync:complete', { pushed: 0, pulled: 0 });
        return { pushed: 0, pulled: 0 };
      }

      pushed = await this.push();
      pulled = await this.pull();

      this.lastSynced = Date.now();
      this.emitEvent('sync:complete', { pushed, pulled });
    } catch (err: any) {
      this.emitEvent('sync:error', { error: err.message });
    } finally {
      this.syncing = false;
      this.emitSyncState();
    }

    return { pushed, pulled };
  }

  // --- Push: replay queued mutations to remote ---

  private async push(): Promise<number> {
    const pending = this.queue.getPending();
    let pushed = 0;

    for (const entry of pending) {
      // Skip dead letters
      if (entry.retries >= this.config.maxRetries) continue;

      // Skip resources not in the sync list
      if (this.config.resources && !this.config.resources.includes(entry.resource)) continue;

      await this.queue.markSyncing(entry.id);

      try {
        switch (entry.action) {
          case 'create': {
            const result = await this.httpDriver.create(entry.resource, entry.data!);
            // Update local with server response (server might add fields)
            const serverData = result.data as Record<string, any>;
            if (serverData && serverData.id) {
              this.localDriver.getStorageBackend().set(entry.resource, serverData.id, serverData);
              // If server changed the ID, remove old local entry
              if (serverData.id !== entry.entityId) {
                this.localDriver.getStorageBackend().remove(entry.resource, entry.entityId);
              }
            }
            break;
          }
          case 'update': {
            const result = await this.httpDriver.update(entry.resource, entry.entityId, entry.data!);
            const serverData = result.data as Record<string, any>;
            if (serverData) {
              this.localDriver.getStorageBackend().set(entry.resource, entry.entityId, serverData);
            }
            break;
          }
          case 'delete': {
            await this.httpDriver.delete(entry.resource, entry.entityId);
            break;
          }
        }

        await this.queue.remove(entry.id);
        pushed++;
      } catch (err: any) {
        // Conflict — apply strategy
        if (err.status === 409 || err.code === 'CONFLICT') {
          await this.handleConflict(entry);
        } else {
          await this.queue.markFailed(entry.id, err.message ?? 'Sync failed');
          this.emitEvent('sync:error', {
            resource: entry.resource,
            action: entry.action,
            error: err.message,
          });
        }
      }
    }

    return pushed;
  }

  // --- Pull: fetch updated data from remote ---

  private async pull(): Promise<number> {
    let totalPulled = 0;

    for (const [resource] of this.registeredResources) {
      if (this.config.resources && !this.config.resources.includes(resource)) continue;

      try {
        totalPulled += await this.pullResource(resource);
      } catch {
        // Silently skip resources that fail to pull
      }
    }

    return totalPulled;
  }

  private async pullResource(resource: string): Promise<number> {
    const storage = this.localDriver.getStorageBackend();
    const lastPullKey = `_sync:lastPull:${resource}`;
    const lastPull = storage.getMeta(lastPullKey);

    const filter: Record<string, any> = {};
    if (lastPull) {
      filter.updatedAt__gt = lastPull;
    }

    // Pull in pages
    let page = 1;
    let pulled = 0;
    let maxUpdatedAt = lastPull ?? '';

    while (true) {
      const result = await this.httpDriver.list<Record<string, any>>(resource, {
        filter: Object.keys(filter).length > 0 ? filter : undefined,
        size: 200,
        page,
        sort: { field: 'updatedAt', direction: 'asc' },
      });

      for (const item of result.items) {
        // Don't overwrite locally pending mutations
        const hasPending = this.queue.getPending().some(
          e => e.resource === resource && e.entityId === item.id,
        );
        if (hasPending && this.config.conflictStrategy !== 'server-wins') continue;

        storage.set(resource, item.id, item);
        pulled++;

        if (item.updatedAt && item.updatedAt > maxUpdatedAt) {
          maxUpdatedAt = item.updatedAt;
        }
      }

      if (result.items.length < 200 || page >= result.meta.totalPages) break;
      page++;
    }

    if (maxUpdatedAt) {
      storage.setMeta(lastPullKey, maxUpdatedAt);
    }

    // Emit remote events so React hooks auto-refetch
    if (pulled > 0 && this.eventBus) {
      this.eventBus.emit({
        action: 'updated',
        resource,
        timestamp: Date.now(),
        source: 'remote',
      });
    }

    return pulled;
  }

  // --- Conflict resolution ---

  private async handleConflict(entry: typeof this.queue extends { getPending(): (infer E)[] } ? E : never): Promise<void> {
    const strategy = this.config.conflictStrategy;

    if (strategy === 'server-wins') {
      // Discard local change, pull server version
      await this.queue.remove(entry.id);
      try {
        const result = await this.httpDriver.get(entry.resource, entry.entityId);
        this.localDriver.getStorageBackend().set(entry.resource, entry.entityId, result.data as any);
      } catch {
        // Entity deleted on server
      }
    } else if (strategy === 'client-wins' || strategy === 'last-write-wins') {
      // Retry with force — for last-write-wins, the next attempt should succeed
      // since we just got 409, pull server version, merge, and retry
      try {
        const serverResult = await this.httpDriver.get(entry.resource, entry.entityId);
        const serverData = serverResult.data as Record<string, any>;

        if (entry.action === 'update' && entry.data) {
          // Merge: client fields over server
          const merged = { ...serverData, ...entry.data };
          await this.httpDriver.update(entry.resource, entry.entityId, merged);
          this.localDriver.getStorageBackend().set(entry.resource, entry.entityId, merged);
        }
        await this.queue.remove(entry.id);
      } catch {
        await this.queue.markFailed(entry.id, 'Conflict resolution failed');
      }
    }

    this.emitEvent('sync:conflict', {
      resource: entry.resource,
      action: entry.action,
      entityId: entry.entityId,
    });
  }

  // --- Connectivity ---

  private setupConnectivityListeners(): void {
    if (typeof window === 'undefined') return;

    window.addEventListener('online', () => this.handleOnline());
    window.addEventListener('offline', () => this.handleOffline());
  }

  private async checkOnline(): Promise<boolean> {
    if (typeof navigator !== 'undefined' && !navigator.onLine) return false;

    try {
      const baseUrl = (this.httpDriver as any).baseUrl as string;
      const response = await fetch(`${baseUrl}${this.config.pingUrl}`, {
        method: 'HEAD',
        cache: 'no-store',
        signal: AbortSignal.timeout(5000),
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  private handleOnline(): void {
    if (this.online) return;
    this.online = true;
    this.emitEvent('online');
    this.emitSyncState();
    // Immediate sync on reconnect
    this.sync().catch(() => {});
  }

  private handleOffline(): void {
    if (!this.online) return;
    this.online = false;
    this.emitEvent('offline');
    this.emitSyncState();
  }

  // --- State ---

  getSyncState(): SyncState {
    return {
      isOnline: this.online,
      isSyncing: this.syncing,
      pendingCount: this.queue.getPendingCount(),
      lastSynced: this.lastSynced,
    };
  }

  // --- Events ---

  private emitEvent(type: string, data?: Record<string, any>): void {
    if (!this.eventBus) return;
    this.eventBus.emit({
      action: type as any,
      resource: '__sync',
      data: { type, ...data },
      timestamp: Date.now(),
      source: 'local',
    });
  }

  private emitSyncState(): void {
    this.emitEvent('state', this.getSyncState());
  }
}
