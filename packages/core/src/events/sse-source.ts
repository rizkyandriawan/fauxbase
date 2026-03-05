import type { EventSourceAdapter, SSEConfig, FauxbaseEvent, EventAction } from './types';
import type { EventBus } from './event-bus';

export class SSESource implements EventSourceAdapter {
  private eventSource: EventSource | null = null;

  constructor(
    private config: SSEConfig,
    private eventBus: EventBus,
  ) {}

  connect(): void {
    this.eventSource = new EventSource(this.config.url, {
      withCredentials: this.config.withCredentials,
    });

    for (const [eventType, resource] of Object.entries(this.config.eventMap)) {
      this.eventSource.addEventListener(eventType, (e: MessageEvent) => {
        const parsed = this.parseEvent(e, resource);
        if (parsed) {
          this.eventBus.emit(parsed);
        }
      });
    }
  }

  disconnect(): void {
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }
  }

  private parseEvent(e: MessageEvent, resource: string): FauxbaseEvent | null {
    try {
      const raw = JSON.parse(e.data);
      return {
        action: raw.action as EventAction,
        resource,
        data: raw.data,
        id: raw.id,
        ids: raw.ids,
        timestamp: raw.timestamp ?? Date.now(),
        source: 'remote',
      };
    } catch {
      return null;
    }
  }
}
