import type { SeedDefinition } from './types';

export function seed<T>(entityClass: new (...args: any[]) => T, data: Array<Partial<T>>): SeedDefinition<T> {
  const entityName = entityClass.name.toLowerCase();
  return { entityName, entityClass, data };
}

export function computeSeedVersion(seeds: SeedDefinition[]): string {
  const content = JSON.stringify(
    seeds.map(s => ({ entity: s.entityName, data: s.data })),
  );
  return simpleHash(content);
}

function simpleHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(36);
}
