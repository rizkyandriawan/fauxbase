import { describe, it, expect } from 'vitest';
import { seed, computeSeedVersion } from '../src/seed';
import { Entity, field } from '../src/entity';

class Product extends Entity {
  @field({ required: true }) name!: string;
  @field({ min: 0 })         price!: number;
}

describe('seed', () => {
  it('returns correct SeedDefinition', () => {
    const def = seed(Product, [
      { name: 'A', price: 100 },
      { name: 'B', price: 200 },
    ]);
    expect(def.entityName).toBe('product');
    expect(def.entityClass).toBe(Product);
    expect(def.data).toHaveLength(2);
  });
});

describe('computeSeedVersion', () => {
  it('returns same hash for same data', () => {
    const seeds = [seed(Product, [{ name: 'A', price: 100 }])];
    const v1 = computeSeedVersion(seeds);
    const v2 = computeSeedVersion(seeds);
    expect(v1).toBe(v2);
  });

  it('returns different hash for different data', () => {
    const v1 = computeSeedVersion([seed(Product, [{ name: 'A', price: 100 }])]);
    const v2 = computeSeedVersion([seed(Product, [{ name: 'A', price: 200 }])]);
    expect(v1).not.toBe(v2);
  });

  it('returns different hash when seed count changes', () => {
    const v1 = computeSeedVersion([seed(Product, [{ name: 'A' }])]);
    const v2 = computeSeedVersion([seed(Product, [{ name: 'A' }, { name: 'B' }])]);
    expect(v1).not.toBe(v2);
  });
});
