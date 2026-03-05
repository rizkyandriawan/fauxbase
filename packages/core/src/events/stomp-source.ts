import type { EventSourceAdapter, STOMPConfig, FauxbaseEvent, EventAction } from './types';
import type { EventBus } from './event-bus';

export class STOMPSource implements EventSourceAdapter {
  private client: any = null;

  constructor(
    private config: STOMPConfig,
    private eventBus: EventBus,
  ) {}

  connect(): void {
    this.connectAsync();
  }

  reconnect(): void {
    this.disconnect();
    this.connect();
  }

  private async connectAsync(): Promise<void> {
    let StompJs: any;
    try {
      const moduleName = '@stomp/stompjs';
      StompJs = await (Function('m', 'return import(m)')(moduleName));
    } catch {
      throw new Error(
        'STOMP source requires @stomp/stompjs. Install it: npm install @stomp/stompjs',
      );
    }

    const headers = { ...this.config.connectHeaders };

    // Auto-inject auth token if available
    if (this.config.getAuthToken) {
      const token = this.config.getAuthToken();
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
    }

    this.client = new StompJs.Client({
      brokerURL: this.config.brokerUrl,
      connectHeaders: headers,
      onConnect: () => {
        for (const [destination, resource] of Object.entries(this.config.subscriptions)) {
          this.client.subscribe(destination, (message: any) => {
            const parsed = this.parseMessage(message, resource);
            if (parsed) {
              this.eventBus.emit(parsed);
            }
          });
        }
      },
    });

    this.client.activate();
  }

  disconnect(): void {
    if (this.client) {
      this.client.deactivate();
      this.client = null;
    }
  }

  private parseMessage(message: any, resource: string): FauxbaseEvent | null {
    try {
      const raw = JSON.parse(message.body);
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
