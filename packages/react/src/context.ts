import { createContext, createElement, useContext } from 'react';
import type { Service, EventBus } from 'fauxbase';
import type { FauxbaseContextValue } from './types';

// --- Context ---

export const FauxbaseContext = createContext<FauxbaseContextValue | null>(null);

// --- Provider ---

export function FauxbaseProvider(props: {
  client: any;
  children: React.ReactNode;
}) {
  // Invalidation registry: Service → Set of refetch callbacks
  const registryRef = { current: new Map<Service<any>, Set<() => void>>() };

  const value: FauxbaseContextValue = {
    client: props.client,
    invalidate: (service: Service<any>) => {
      const subscribers = registryRef.current.get(service);
      if (subscribers) {
        for (const fn of subscribers) {
          fn();
        }
      }
    },
    subscribe: (service: Service<any>, refetchFn: () => void) => {
      if (!registryRef.current.has(service)) {
        registryRef.current.set(service, new Set());
      }
      registryRef.current.get(service)!.add(refetchFn);
      return () => {
        registryRef.current.get(service)?.delete(refetchFn);
      };
    },
  };

  // Bridge remote events → auto-invalidation
  const eventBus: EventBus | undefined = props.client._eventBus;
  if (eventBus) {
    eventBus.onAny((event) => {
      if (event.source !== 'remote') return;
      const svc = props.client[event.resource];
      if (svc) {
        value.invalidate(svc);
      }
    });
  }

  return createElement(FauxbaseContext.Provider, { value }, props.children);
}

// --- Hook ---

export function useFauxbaseContext(): FauxbaseContextValue {
  const ctx = useContext(FauxbaseContext);
  if (!ctx) {
    throw new Error('useFauxbaseContext must be used within a FauxbaseProvider');
  }
  return ctx;
}
