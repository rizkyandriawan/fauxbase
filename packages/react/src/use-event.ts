import { useEffect } from 'react';
import type { Service, Entity, EventBus, EventHandler } from 'fauxbase';
import { useFauxbaseContext } from './context';

export function useEvent<T extends Entity>(
  serviceOrResource: Service<T> | string,
  handler: EventHandler<T>,
): void {
  const ctx = useFauxbaseContext();

  useEffect(() => {
    const eventBus: EventBus | undefined = ctx.client._eventBus;
    if (!eventBus) return;

    const resource = typeof serviceOrResource === 'string'
      ? serviceOrResource
      : (serviceOrResource as any).resourceName;

    return eventBus.on(resource, handler);
  }, [serviceOrResource, handler, ctx.client]);
}
