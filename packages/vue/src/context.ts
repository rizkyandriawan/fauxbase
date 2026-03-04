import { inject, provide } from 'vue';
import type { App, InjectionKey } from 'vue';
import type { Service } from 'fauxbase';
import type { FauxbaseContextValue } from './types';

const FAUXBASE_KEY: InjectionKey<FauxbaseContextValue> = Symbol('fauxbase');

// --- Plugin (app.use) ---

export const FauxbasePlugin = {
  install(app: App, options: { client: any }) {
    const registry = new Map<Service<any>, Set<() => void>>();

    const value: FauxbaseContextValue = {
      client: options.client,
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

    app.provide(FAUXBASE_KEY, value);
  },
};

// --- Manual provide (for Composition API without plugin) ---

export function provideFauxbase(client: any): void {
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

  provide(FAUXBASE_KEY, value);
}

// --- Inject ---

export function useFauxbaseContext(): FauxbaseContextValue {
  const ctx = inject(FAUXBASE_KEY);
  if (!ctx) {
    throw new Error('useFauxbaseContext requires FauxbasePlugin to be installed or provideFauxbase to be called');
  }
  return ctx;
}

export { FAUXBASE_KEY };
