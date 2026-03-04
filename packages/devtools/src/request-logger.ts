import type { RequestLogEntry } from './types';

let idCounter = 0;

export function createRequestLogger(maxEntries = 100) {
  const entries: RequestLogEntry[] = [];
  const listeners = new Set<() => void>();

  function addEntry(entry: RequestLogEntry): void {
    entries.unshift(entry);
    if (entries.length > maxEntries) {
      entries.pop();
    }
    listeners.forEach(fn => fn());
  }

  function getEntries(): RequestLogEntry[] {
    return entries;
  }

  function clear(): void {
    entries.length = 0;
    listeners.forEach(fn => fn());
  }

  function subscribe(fn: () => void): () => void {
    listeners.add(fn);
    return () => listeners.delete(fn);
  }

  /**
   * Wraps a service instance with a Proxy that logs all method calls.
   * Zero changes to the Service class.
   */
  function wrapService<T extends object>(service: T, serviceName: string): T {
    return new Proxy(service, {
      get(target, prop, receiver) {
        const value = Reflect.get(target, prop, receiver);
        if (typeof value !== 'function') return value;

        // Skip internal methods
        if (typeof prop === 'string' && prop.startsWith('_')) return value;

        return async function (this: any, ...args: any[]) {
          const entry: RequestLogEntry = {
            id: `log_${++idCounter}`,
            timestamp: Date.now(),
            service: serviceName,
            method: prop as string,
            args,
            duration: 0,
          };

          const start = performance.now();
          try {
            const result = await value.apply(target, args);
            entry.result = result;
            entry.duration = Math.round(performance.now() - start);
            addEntry(entry);
            return result;
          } catch (err: any) {
            entry.error = err.message ?? String(err);
            entry.duration = Math.round(performance.now() - start);
            addEntry(entry);
            throw err;
          }
        };
      },
    });
  }

  return { addEntry, getEntries, clear, subscribe, wrapService };
}

export type RequestLogger = ReturnType<typeof createRequestLogger>;
