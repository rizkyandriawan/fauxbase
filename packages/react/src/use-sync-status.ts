import { useState, useEffect, useContext } from 'react';
import { FauxbaseContext } from './context';

export interface UseSyncStatusResult {
  isOnline: boolean;
  isSyncing: boolean;
  pendingCount: number;
  lastSynced: number | null;
}

export function useSyncStatus(): UseSyncStatusResult {
  const ctx = useContext(FauxbaseContext);
  const [state, setState] = useState<UseSyncStatusResult>({
    isOnline: true,
    isSyncing: false,
    pendingCount: 0,
    lastSynced: null,
  });

  useEffect(() => {
    const eventBus = ctx?.client?._eventBus;
    if (!eventBus) return;

    const handler = (event: any) => {
      if (event.data?.type === 'state') {
        setState({
          isOnline: event.data.isOnline,
          isSyncing: event.data.isSyncing,
          pendingCount: event.data.pendingCount,
          lastSynced: event.data.lastSynced,
        });
      }
    };

    const unsub = eventBus.on('__sync', handler);
    return unsub;
  }, [ctx]);

  return state;
}
