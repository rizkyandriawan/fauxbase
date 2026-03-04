import { setContext, getContext } from 'svelte';
import type { Service } from 'fauxbase';
import type { FauxbaseContextValue } from './types';

const FAUXBASE_KEY = 'fauxbase';

export function setFauxbaseContext(client: any): FauxbaseContextValue {
  const registry = new Map<Service<any>, Set<() => void>>();

  const value: FauxbaseContextValue = {
    client,
    invalidate: (service: Service<any>) => {
      const subscribers = registry.get(service);
      if (subscribers) {
        for (const fn of subscribers) {
          fn();
        }
      }
    },
    subscribe: (service: Service<any>, refetchFn: () => void) => {
      if (!registry.has(service)) {
        registry.set(service, new Set());
      }
      registry.get(service)!.add(refetchFn);
      return () => {
        registry.get(service)?.delete(refetchFn);
      };
    },
  };

  setContext(FAUXBASE_KEY, value);
  return value;
}

export function getFauxbaseContext(): FauxbaseContextValue {
  const ctx = getContext<FauxbaseContextValue>(FAUXBASE_KEY);
  if (!ctx) {
    throw new Error('getFauxbaseContext requires setFauxbaseContext to be called in a parent component');
  }
  return ctx;
}

// For testing: create context value without svelte's setContext/getContext
export function createFauxbaseContext(client: any): FauxbaseContextValue {
  const registry = new Map<Service<any>, Set<() => void>>();

  return {
    client,
    invalidate: (service: Service<any>) => {
      const subscribers = registry.get(service);
      if (subscribers) {
        for (const fn of subscribers) {
          fn();
        }
      }
    },
    subscribe: (service: Service<any>, refetchFn: () => void) => {
      if (!registry.has(service)) {
        registry.set(service, new Set());
      }
      registry.get(service)!.add(refetchFn);
      return () => {
        registry.get(service)?.delete(refetchFn);
      };
    },
  };
}
