import { onDestroy } from 'svelte';
import type { Service, Entity, EventBus, EventHandler } from 'fauxbase';
import { getFauxbaseContext } from './context';

export function useEvent<T extends Entity>(
  serviceOrResource: Service<T> | string,
  handler: EventHandler<T>,
): void {
  const ctx = getFauxbaseContext();
  const eventBus: EventBus | undefined = ctx.client._eventBus;
  if (!eventBus) return;

  const resource = typeof serviceOrResource === 'string'
    ? serviceOrResource
    : (serviceOrResource as any).resourceName;

  const unsub = eventBus.on(resource, handler);
  onDestroy(unsub);
}
