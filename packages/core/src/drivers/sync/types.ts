export interface SyncDriverConfig {
  type: 'sync';
  local: { persist?: 'localStorage' | 'indexeddb'; dbName?: string };
  remote: { baseUrl: string; preset?: string; timeout?: number; retry?: { maxRetries?: number; baseDelay?: number }; headers?: Record<string, string> };
  sync?: {
    interval?: number;
    retryDelay?: number;
    maxRetries?: number;
    conflictStrategy?: 'last-write-wins' | 'server-wins' | 'client-wins';
    resources?: string[];
    pingUrl?: string;
  };
}

export interface QueueEntry {
  id: string;
  resource: string;
  action: 'create' | 'update' | 'delete';
  entityId: string;
  data: Record<string, any> | null;
  timestamp: number;
  status: 'pending' | 'syncing' | 'failed';
  retries: number;
  error?: string;
}

export interface SyncState {
  isOnline: boolean;
  isSyncing: boolean;
  pendingCount: number;
  lastSynced: number | null;
}
