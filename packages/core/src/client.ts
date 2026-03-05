import type { DriverConfig, HttpDriverConfig, SeedDefinition } from './types';
import type { Driver } from './drivers/types';
import type { AuthState } from './auth';
import type { EventsConfig, EventSourceAdapter } from './events/types';
import { LocalDriver } from './drivers/local';
import { HttpDriver } from './drivers/http';
import { Service } from './service';
import { AuthService } from './auth';
import { EventBus } from './events/event-bus';
import { SSESource } from './events/sse-source';
import { STOMPSource } from './events/stomp-source';
import { computeSeedVersion } from './seed';

// --- Type inference ---

type ClientServices<S extends Record<string, new (...args: any[]) => Service<any>>> = {
  [K in keyof S]: InstanceType<S[K]>;
};

type ClientResult<
  S extends Record<string, new (...args: any[]) => Service<any>>,
  A extends (new (...args: any[]) => AuthService<any>) | undefined,
> = ClientServices<S>
  & (A extends new (...args: any[]) => AuthService<any> ? { auth: InstanceType<A> } : {})
  & { readonly ready: Promise<void> }
  & { _eventBus?: EventBus; disconnect?: () => void };

// --- Factory ---

export function createClient<
  S extends Record<string, new (...args: any[]) => Service<any>>,
  A extends (new (...args: any[]) => AuthService<any>) | undefined = undefined,
>(
  config: {
    driver?: DriverConfig;
    services: S;
    seeds?: SeedDefinition[];
    auth?: A;
    overrides?: Record<string, { driver: DriverConfig }>;
    events?: EventsConfig;
  },
): ClientResult<S, A> {
  const driverConfig = config.driver ?? { type: 'local' as const };
  const defaultDriver = createDriver(driverConfig);

  const client = {} as any;
  const overrideDrivers = new Map<string, Driver>();

  // Create override drivers
  if (config.overrides) {
    for (const [name, override] of Object.entries(config.overrides)) {
      overrideDrivers.set(name, createDriver(override.driver));
    }
  }

  // Register all services
  for (const [name, ServiceClass] of Object.entries(config.services)) {
    const instance = new ServiceClass();
    const driver = overrideDrivers.get(name) ?? defaultDriver;
    instance._init(driver, name);

    if (driver instanceof LocalDriver) {
      driver.registerEntity(name, instance.entity);
    }

    if (driver instanceof HttpDriver) {
      driver.registerEndpoint(name, instance.endpoint);
    }

    client[name] = instance;
  }

  // Wire auth if provided
  if (config.auth) {
    const AuthClass = config.auth;
    const authInstance = new AuthClass();
    const resourceName = authInstance.entity.name.toLowerCase();

    if (defaultDriver instanceof LocalDriver) {
      authInstance._init(defaultDriver, resourceName);
      defaultDriver.registerEntity(resourceName, authInstance.entity);

      const storage = defaultDriver.getStorageBackend();
      authInstance._initAuth(
        () => {
          const raw = storage.getMeta('_authState');
          return raw ? JSON.parse(raw) as AuthState : null;
        },
        (state: AuthState | null) => {
          if (state) {
            storage.setMeta('_authState', JSON.stringify(state));
          } else {
            storage.setMeta('_authState', '');
          }
        },
      );

      defaultDriver.setAuthProvider(() => authInstance.getAuthContext());
    } else if (defaultDriver instanceof HttpDriver) {
      authInstance._init(defaultDriver, resourceName);
      defaultDriver.registerEndpoint(resourceName, authInstance.endpoint);

      // In-memory auth state for HTTP mode
      let memoryAuthState: AuthState | null = null;
      authInstance._initAuth(
        () => memoryAuthState,
        (state: AuthState | null) => { memoryAuthState = state; },
      );
      authInstance._setHttpMode(defaultDriver);

      defaultDriver.setAuthProvider(() => {
        const token = authInstance.token;
        return token ? { token } : null;
      });
    }

    client.auth = authInstance;

    // Also set auth provider on override HttpDrivers
    for (const driver of overrideDrivers.values()) {
      if (driver instanceof HttpDriver) {
        driver.setAuthProvider(() => {
          const token = (client.auth as AuthService<any>)?.token;
          return token ? { token } : null;
        });
      }
    }
  }

  // Set client reference on all services (including auth)
  for (const key of Object.keys(client)) {
    const svc = client[key];
    if (svc && typeof svc._setClient === 'function') {
      svc._setClient(client);
    }
  }

  // Wire EventBus if events are configured
  let eventSource: EventSourceAdapter | null = null;
  if (config.events) {
    const eventBus = new EventBus();
    client._eventBus = eventBus;

    // Attach EventBus to all services
    for (const [name, ServiceClass] of Object.entries(config.services)) {
      const svc = client[name] as Service<any>;
      svc._eventBus = eventBus;
    }

    const eventsConfig = config.events === true ? {} : config.events;

    // Register custom handlers
    if (eventsConfig.handlers) {
      for (const [resource, handler] of Object.entries(eventsConfig.handlers)) {
        eventBus.on(resource, handler);
      }
    }

    // Connect event source (SSE or STOMP)
    if (eventsConfig.source) {
      if (eventsConfig.source.type === 'sse') {
        eventSource = new SSESource(eventsConfig.source, eventBus);
      } else if (eventsConfig.source.type === 'stomp') {
        // Auto-inject auth token getter if auth is configured
        const stompConfig = { ...eventsConfig.source };
        if (config.auth && !stompConfig.getAuthToken) {
          stompConfig.getAuthToken = () => (client.auth as AuthService<any>)?.token ?? null;
        }
        eventSource = new STOMPSource(stompConfig, eventBus);
      }
      eventSource?.connect();
    }

    // Reconnect event source on auth state change (login/logout)
    if (eventSource && config.auth) {
      (client.auth as AuthService<any>)._onAuthChange(() => {
        eventSource!.reconnect();
      });
    }

    client.disconnect = () => {
      eventSource?.disconnect();
      eventBus.destroy();
    };
  }

  // Apply seeds (only for local driver)
  let readyPromise: Promise<void>;
  if (defaultDriver instanceof LocalDriver) {
    if (defaultDriver.isReady) {
      // Synchronous backend (memory, localStorage) — apply seeds now
      if (config.seeds) {
        applySeedsIfNeeded(defaultDriver, config.seeds);
      }
      readyPromise = Promise.resolve();
    } else {
      // Async backend (IndexedDB) — defer seeds until ready
      readyPromise = defaultDriver.ready.then(() => {
        if (config.seeds) {
          applySeedsIfNeeded(defaultDriver, config.seeds);
        }
      });
    }
  } else {
    readyPromise = Promise.resolve();
  }
  Object.defineProperty(client, 'ready', {
    value: readyPromise,
    writable: false,
    enumerable: false,
    configurable: false,
  });

  return client as ClientResult<S, A>;
}

function createDriver(config: DriverConfig): Driver {
  switch (config.type) {
    case 'local':
      return new LocalDriver(config);
    case 'http':
      return new HttpDriver(config);
    default:
      throw new Error(`Unknown driver type: ${(config as any).type}`);
  }
}

function applySeedsIfNeeded(driver: LocalDriver, seeds: SeedDefinition[]): void {
  const newVersion = computeSeedVersion(seeds);
  const currentVersion = driver.getSeedVersion();

  if (currentVersion === newVersion) return;

  for (const seedDef of seeds) {
    driver.seed(seedDef.entityName, seedDef.data as any[], seedDef.entityClass);
  }

  driver.setSeedVersion(newVersion);
}
