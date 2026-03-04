import type { DriverConfig, SeedDefinition } from './types';
import type { Driver } from './drivers/types';
import { LocalDriver } from './drivers/local';
import { Service } from './service';
import { computeSeedVersion } from './seed';

// --- Type inference ---

type ClientServices<S extends Record<string, new (...args: any[]) => Service<any>>> = {
  [K in keyof S]: InstanceType<S[K]>;
};

// --- Factory ---

export function createClient<S extends Record<string, new (...args: any[]) => Service<any>>>(
  config: {
    driver?: DriverConfig;
    services: S;
    seeds?: SeedDefinition[];
  },
): ClientServices<S> {
  const driverConfig = config.driver ?? { type: 'local' as const };
  const driver = createDriver(driverConfig);

  const client = {} as ClientServices<S>;

  for (const [name, ServiceClass] of Object.entries(config.services)) {
    const instance = new ServiceClass();
    instance._init(driver, name);

    if (driver instanceof LocalDriver) {
      driver.registerEntity(name, instance.entity);
    }

    (client as any)[name] = instance;
  }

  if (config.seeds && driver instanceof LocalDriver) {
    applySeedsIfNeeded(driver, config.seeds);
  }

  return client;
}

function createDriver(config: DriverConfig): Driver {
  switch (config.type) {
    case 'local':
      return new LocalDriver(config);
    case 'http':
      throw new Error('HttpDriver not implemented yet');
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
