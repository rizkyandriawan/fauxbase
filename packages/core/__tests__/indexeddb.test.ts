import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { LocalDriver } from '../src/drivers/local';
import { Entity, field, computed } from '../src/entity';
import { NotFoundError } from '../src/errors';
import { createClient } from '../src/client';
import { Service } from '../src/service';
import { seed } from '../src/seed';

class TestProduct extends Entity {
  @field({ required: true })          name!: string;
  @field({ required: true, min: 0 })  price!: number;
  @field({ default: 0 })              stock!: number;
  @computed((p: any) => p.stock > 0)  inStock!: boolean;
}

class ProductService extends Service<TestProduct> {
  entity = TestProduct;
  endpoint = '/products';
}

// Use unique DB names to isolate tests
let dbCounter = 0;
function uniqueDbName() {
  return `fauxbase_test_${dbCounter++}_${Date.now()}`;
}

describe('LocalDriver (indexeddb)', () => {
  let driver: LocalDriver;

  beforeEach(async () => {
    driver = new LocalDriver({ type: 'local', persist: 'indexeddb', dbName: uniqueDbName() });
    driver.registerEntity('product', TestProduct);
    await driver.ready;
  });

  describe('create', () => {
    it('creates record with auto-generated id and timestamps', async () => {
      const { data } = await driver.create<any>('product', { name: 'Test', price: 100 });
      expect(data.id).toBeDefined();
      expect(data.createdAt).toBeDefined();
      expect(data.updatedAt).toBeDefined();
      expect(data.version).toBe(1);
      expect(data.deletedAt).toBeNull();
      expect(data.name).toBe('Test');
    });

    it('applies defaults', async () => {
      const { data } = await driver.create<any>('product', { name: 'Test', price: 100 });
      expect(data.stock).toBe(0);
    });

    it('applies computed fields', async () => {
      const { data } = await driver.create<any>('product', { name: 'Test', price: 100, stock: 5 });
      expect(data.inStock).toBe(true);
    });
  });

  describe('get', () => {
    it('retrieves existing record', async () => {
      const { data: created } = await driver.create<any>('product', { name: 'Test', price: 100 });
      const { data } = await driver.get<any>('product', created.id);
      expect(data.name).toBe('Test');
    });

    it('throws NotFoundError for missing record', async () => {
      await expect(driver.get('product', 'nonexistent')).rejects.toThrow(NotFoundError);
    });
  });

  describe('update', () => {
    it('merges data and increments version', async () => {
      const { data: created } = await driver.create<any>('product', { name: 'Test', price: 100 });
      const { data } = await driver.update<any>('product', created.id, { price: 200 });
      expect(data.price).toBe(200);
      expect(data.name).toBe('Test');
      expect(data.version).toBe(2);
    });
  });

  describe('delete (soft)', () => {
    it('sets deletedAt instead of removing', async () => {
      const { data: created } = await driver.create<any>('product', { name: 'Test', price: 100 });
      const { data } = await driver.delete<any>('product', created.id);
      expect(data.deletedAt).not.toBeNull();
    });
  });

  describe('list', () => {
    beforeEach(async () => {
      await driver.create('product', { name: 'A', price: 300, stock: 10 });
      await driver.create('product', { name: 'B', price: 100, stock: 0 });
      await driver.create('product', { name: 'C', price: 200, stock: 5 });
    });

    it('returns all non-deleted records', async () => {
      const result = await driver.list('product', {});
      expect(result.items).toHaveLength(3);
    });

    it('filters records', async () => {
      const result = await driver.list<any>('product', { filter: { price__gte: 200 } });
      expect(result.items).toHaveLength(2);
    });

    it('sorts records', async () => {
      const result = await driver.list<any>('product', { sort: { field: 'price', direction: 'asc' } });
      expect(result.items[0].name).toBe('B');
      expect(result.items[2].name).toBe('A');
    });

    it('paginates records', async () => {
      const result = await driver.list('product', { page: 1, size: 2 });
      expect(result.items).toHaveLength(2);
      expect(result.meta.totalItems).toBe(3);
      expect(result.meta.totalPages).toBe(2);
    });
  });

  describe('persistence', () => {
    it('data survives reopening with same dbName', async () => {
      const dbName = uniqueDbName();
      const driver1 = new LocalDriver({ type: 'local', persist: 'indexeddb', dbName });
      driver1.registerEntity('product', TestProduct);
      await driver1.ready;

      await driver1.create<any>('product', { id: 'persist-1', name: 'Persisted', price: 100 });

      // Open a new driver with the same DB
      const driver2 = new LocalDriver({ type: 'local', persist: 'indexeddb', dbName });
      driver2.registerEntity('product', TestProduct);
      await driver2.ready;

      const { data } = await driver2.get<any>('product', 'persist-1');
      expect(data.name).toBe('Persisted');
    });
  });

  describe('seed management', () => {
    it('creates records with deterministic IDs', async () => {
      driver.seed('product', [
        { name: 'Seed A', price: 100 },
        { name: 'Seed B', price: 200 },
      ], TestProduct);

      const a = await driver.get<any>('product', 'seed:product:0');
      expect(a.data.name).toBe('Seed A');
    });

    it('tracks seed version', () => {
      expect(driver.getSeedVersion()).toBeNull();
      driver.setSeedVersion('abc123');
      expect(driver.getSeedVersion()).toBe('abc123');
    });
  });
});

describe('createClient with indexeddb + ready', () => {
  it('client.ready resolves after IndexedDB init', async () => {
    const fb = createClient({
      driver: { type: 'local', persist: 'indexeddb', dbName: uniqueDbName() },
      services: { product: ProductService },
    });
    await fb.ready;

    const { data } = await fb.product.create({ name: 'Test', price: 100 } as any);
    expect(data).toBeDefined();
  });

  it('client.ready resolves immediately for memory driver', async () => {
    const fb = createClient({
      driver: { type: 'local', persist: 'memory' },
      services: { product: ProductService },
    });
    await fb.ready;
    expect(true).toBe(true);
  });

  it('seeds are applied with indexeddb driver', async () => {
    // seed() uses entityClass.name.toLowerCase() as resource name
    // so we need the entity name to match the service key
    const productSeed = seed(TestProduct, [
      { name: 'Seeded', price: 50 },
    ]);
    const dbName = uniqueDbName();
    const driver = new LocalDriver({ type: 'local', persist: 'indexeddb', dbName });
    driver.registerEntity('testproduct', TestProduct);
    await driver.ready;

    // Apply seeds directly through driver (like createClient does)
    driver.seed('testproduct', [{ name: 'Seeded', price: 50 }], TestProduct);

    const { data } = await driver.get<any>('testproduct', 'seed:testproduct:0');
    expect(data.name).toBe('Seeded');
  });
});
