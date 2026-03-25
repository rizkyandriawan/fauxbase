import type { QueueEntry } from './types';

const STORE_NAME = 'queue';

function generateId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export class SyncQueue {
  private db: IDBDatabase | null = null;
  private cache: QueueEntry[] = [];
  private _ready: Promise<void>;

  constructor(dbName = 'fauxbase-sync-queue') {
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
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
          store.createIndex('resource_entity', ['resource', 'entityId']);
          store.createIndex('status', 'status');
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
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);

    return new Promise((resolve, reject) => {
      const req = store.getAll();
      req.onsuccess = () => {
        this.cache = (req.result as QueueEntry[]).sort((a, b) => a.timestamp - b.timestamp);
        resolve();
      };
      req.onerror = () => reject(req.error);
    });
  }

  private persist(entry: QueueEntry): void {
    if (!this.db) return;
    const tx = this.db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(entry);
  }

  private removeFromDb(id: string): void {
    if (!this.db) return;
    const tx = this.db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).delete(id);
  }

  async enqueue(entry: Omit<QueueEntry, 'id' | 'status' | 'retries'>): Promise<void> {
    // Coalesce with existing pending entries for same resource + entityId
    const existing = this.cache.find(
      e => e.resource === entry.resource
        && e.entityId === entry.entityId
        && (e.status === 'pending' || e.status === 'failed'),
    );

    if (existing) {
      if (existing.action === 'create' && entry.action === 'update') {
        // Merge update data into create — server will get the final state
        existing.data = { ...existing.data, ...entry.data };
        this.persist(existing);
        return;
      }
      if (existing.action === 'create' && entry.action === 'delete') {
        // Created then deleted before sync — cancel both
        this.cache = this.cache.filter(e => e.id !== existing.id);
        this.removeFromDb(existing.id);
        return;
      }
      if (existing.action === 'update' && entry.action === 'update') {
        // Merge updates
        existing.data = { ...existing.data, ...entry.data };
        this.persist(existing);
        return;
      }
      if (existing.action === 'update' && entry.action === 'delete') {
        // Replace update with delete
        existing.action = 'delete';
        existing.data = null;
        this.persist(existing);
        return;
      }
    }

    // No coalescing — add new entry
    const full: QueueEntry = {
      ...entry,
      id: generateId(),
      status: 'pending',
      retries: 0,
    };
    this.cache.push(full);
    this.persist(full);
  }

  getPending(): QueueEntry[] {
    return this.cache
      .filter(e => e.status === 'pending' || e.status === 'failed')
      .sort((a, b) => a.timestamp - b.timestamp);
  }

  getPendingCount(): number {
    return this.cache.filter(e => e.status === 'pending' || e.status === 'failed').length;
  }

  async markSyncing(id: string): Promise<void> {
    const entry = this.cache.find(e => e.id === id);
    if (entry) {
      entry.status = 'syncing';
      this.persist(entry);
    }
  }

  async remove(id: string): Promise<void> {
    this.cache = this.cache.filter(e => e.id !== id);
    this.removeFromDb(id);
  }

  async markFailed(id: string, error: string): Promise<void> {
    const entry = this.cache.find(e => e.id === id);
    if (entry) {
      entry.status = 'failed';
      entry.retries++;
      entry.error = error;
      this.persist(entry);
    }
  }

  getDeadLetters(maxRetries: number): QueueEntry[] {
    return this.cache.filter(e => e.status === 'failed' && e.retries >= maxRetries);
  }
}
