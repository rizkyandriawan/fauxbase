import type { FauxbaseEvent, EventHandler } from './types';

export class EventBus {
  private listeners = new Map<string, Set<EventHandler>>();
  private anyListeners = new Set<EventHandler>();

  on(resource: string, handler: EventHandler): () => void {
    if (!this.listeners.has(resource)) {
      this.listeners.set(resource, new Set());
    }
    this.listeners.get(resource)!.add(handler);
    return () => {
      this.listeners.get(resource)?.delete(handler);
    };
  }

  onAny(handler: EventHandler): () => void {
    this.anyListeners.add(handler);
    return () => {
      this.anyListeners.delete(handler);
    };
  }

  emit(event: FauxbaseEvent): void {
    const resourceListeners = this.listeners.get(event.resource);
    if (resourceListeners) {
      for (const handler of resourceListeners) {
        handler(event);
      }
    }
    for (const handler of this.anyListeners) {
      handler(event);
    }
  }

  destroy(): void {
    this.listeners.clear();
    this.anyListeners.clear();
  }
}
