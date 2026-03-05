export type EventAction = 'created' | 'updated' | 'deleted' | 'bulkCreated' | 'bulkUpdated' | 'bulkDeleted';

export interface FauxbaseEvent<T = any> {
  action: EventAction;
  resource: string;
  data?: T;
  id?: string;
  ids?: string[];
  timestamp: number;
  source: 'local' | 'remote';
}

export type EventHandler<T = any> = (event: FauxbaseEvent<T>) => void;

export interface EventSourceAdapter {
  connect(): void;
  disconnect(): void;
  reconnect(): void;
}

export interface SSEConfig {
  type: 'sse';
  url: string;
  eventMap: Record<string, string>;
  withCredentials?: boolean;
}

export interface STOMPConfig {
  type: 'stomp';
  brokerUrl: string;
  subscriptions: Record<string, string>;
  connectHeaders?: Record<string, string>;
  /** @internal — injected by createClient when auth is configured */
  getAuthToken?: () => string | null;
}

export type EventSourceConfig = SSEConfig | STOMPConfig;

export interface EventHandlersConfig {
  [resource: string]: EventHandler;
}

export type EventsConfig = true | {
  source?: EventSourceConfig;
  handlers?: EventHandlersConfig;
};
