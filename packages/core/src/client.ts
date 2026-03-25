import type { DriverConfig, HttpDriverConfig, SeedDefinition } from './types';
import type { Driver } from './drivers/types';
import type { AuthState } from './auth';
import type { EventsConfig, EventSourceAdapter } from './events/types';
import { LocalDriver } from './drivers/local';
import { HttpDriver } from './drivers/http';
import { SyncDriver } from './drivers/sync/sync-driver';
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

    if (driver instanceof SyncDriver) {
      driver.registerEntity(name, instance.entity);
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

      // Persist auth state to localStorage (falls back to memory if unavailable)
      const hasLocalStorage = typeof localStorage !== 'undefined';
      const LS_AUTH_KEY = 'fauxbase:auth';
      let memoryAuthState: AuthState | null = null;

      authInstance._initAuth(
        () => {
          if (hasLocalStorage) {
            const raw = localStorage.getItem(LS_AUTH_KEY);
            return raw ? JSON.parse(raw) as AuthState : null;
          }
          return memoryAuthState;
        },
        (state: AuthState | null) => {
          if (hasLocalStorage) {
            if (state) {
              localStorage.setItem(LS_AUTH_KEY, JSON.stringify(state));
            } else {
              localStorage.removeItem(LS_AUTH_KEY);
            }
          }
          memoryAuthState = state;
        },
      );
      authInstance._setHttpMode(defaultDriver);

      defaultDriver.setAuthProvider(() => {
        const token = authInstance.token;
        return token ? { token } : null;
      });

      // Auto-refresh on 401: try to refresh token, return true if successful
      defaultDriver.setOnUnauthorized(async () => {
        try {
          await authInstance.refresh();
          return true;
        } catch {
          return false;
        }
      });
    } else if (defaultDriver instanceof SyncDriver) {
      // SyncDriver: auth via HTTP (login hits remote), data stored locally
      // Use the internal HttpDriver for auth calls
      authInstance._init(defaultDriver, resourceName);
      defaultDriver.registerEntity(resourceName, authInstance.entity);
      defaultDriver.registerEndpoint(resourceName, authInstance.endpoint);

      // Persist auth to localStorage
      const hasLocalStorage = typeof localStorage !== 'undefined';
      const LS_AUTH_KEY = 'fauxbase:auth';
      let memoryAuthState: AuthState | null = null;

      authInstance._initAuth(
        () => {
          if (hasLocalStorage) {
            const raw = localStorage.getItem(LS_AUTH_KEY);
            return raw ? JSON.parse(raw) as AuthState : null;
          }
          return memoryAuthState;
        },
        (state: AuthState | null) => {
          if (hasLocalStorage) {
            if (state) {
              localStorage.setItem(LS_AUTH_KEY, JSON.stringify(state));
            } else {
              localStorage.removeItem(LS_AUTH_KEY);
            }
          }
          memoryAuthState = state;
        },
      );
      authInstance._setHttpMode(defaultDriver._httpDriver);

      defaultDriver.setAuthProvider(() => {
        const token = authInstance.token;
        return token ? { token } : null;
      });

      defaultDriver.setOnUnauthorized(async () => {
        try {
          await authInstance.refresh();
          return true;
        } catch {
          return false;
        }
      });
    }

    client.auth = authInstance;

    // Also set auth provider + refresh handler on override HttpDrivers
    for (const driver of overrideDrivers.values()) {
      if (driver instanceof HttpDriver) {
        driver.setAuthProvider(() => {
          const token = (client.auth as AuthService<any>)?.token;
          return token ? { token } : null;
        });
        driver.setOnUnauthorized(async () => {
          try {
            await (client.auth as AuthService<any>).refresh();
            return true;
          } catch {
            return false;
          }
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

    // Wire EventBus to SyncEngine if using SyncDriver
    if (defaultDriver instanceof SyncDriver) {
      defaultDriver.syncEngine.setEventBus(eventBus);
    }

    client.disconnect = () => {
      eventSource?.disconnect();
      if (defaultDriver instanceof SyncDriver) {
        defaultDriver.syncEngine.stop();
      }
      eventBus.destroy();
    };
  }

  // Apply seeds and resolve ready promise
  let readyPromise: Promise<void>;
  if (defaultDriver instanceof LocalDriver) {
    if (defaultDriver.isReady) {
      if (config.seeds) {
        applySeedsIfNeeded(defaultDriver, config.seeds);
      }
      readyPromise = Promise.resolve();
    } else {
      readyPromise = defaultDriver.ready.then(() => {
        if (config.seeds) {
          applySeedsIfNeeded(defaultDriver, config.seeds);
        }
      });
    }
  } else if (defaultDriver instanceof SyncDriver) {
    readyPromise = defaultDriver.ready.then(() => {
      if (config.seeds) {
        applySeedsIfNeeded(defaultDriver as any, config.seeds);
      }
      // Start sync engine after ready
      defaultDriver.syncEngine.start();
    });
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
    case 'sync':
      return new SyncDriver(config);
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
