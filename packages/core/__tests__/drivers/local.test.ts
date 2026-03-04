import { describe, it, expect, beforeEach } from 'vitest';
import { LocalDriver } from '../../src/drivers/local';
import { Entity, field, computed } from '../../src/entity';
import { NotFoundError } from '../../src/errors';

class TestProduct extends Entity {
  @field({ required: true })          name!: string;
  @field({ required: true, min: 0 })  price!: number;
  @field({ default: 0 })              stock!: number;
  @field({ default: true })           isActive!: boolean;
  @computed((p: any) => p.stock > 0)  inStock!: boolean;
}

describe('LocalDriver (memory)', () => {
  let driver: LocalDriver;

  beforeEach(() => {
    driver = new LocalDriver({ type: 'local', persist: 'memory' });
    driver.registerEntity('product', TestProduct);
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
      expect(data.isActive).toBe(true);
    });

    it('applies computed fields', async () => {
      const { data } = await driver.create<any>('product', { name: 'Test', price: 100, stock: 5 });
      expect(data.inStock).toBe(true);
    });

    it('validates required fields', async () => {
      await expect(driver.create('product', { price: 100 })).rejects.toThrow(NotFoundError.name === 'x' ? '' : 'Validation');
    });

    it('validates min constraint', async () => {
      await expect(driver.create('product', { name: 'Test', price: -1 })).rejects.toThrow('Validation');
    });

    it('preserves provided id', async () => {
      const { data } = await driver.create<any>('product', { id: 'custom-id', name: 'Test', price: 100 });
      expect(data.id).toBe('custom-id');
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

    it('throws NotFoundError for soft-deleted record', async () => {
      const { data: created } = await driver.create<any>('product', { name: 'Test', price: 100 });
      await driver.delete('product', created.id);
      await expect(driver.get('product', created.id)).rejects.toThrow(NotFoundError);
    });
  });

  describe('update', () => {
    it('merges data and increments version', async () => {
      const { data: created } = await driver.create<any>('product', { name: 'Test', price: 100 });
      const { data } = await driver.update<any>('product', created.id, { price: 200 });
      expect(data.price).toBe(200);
      expect(data.name).toBe('Test');
      expect(data.version).toBe(2);
      expect(data.updatedAt).toBeDefined();
      expect(data.createdAt).toBe(created.createdAt);
    });

    it('throws NotFoundError for missing record', async () => {
      await expect(driver.update('product', 'nonexistent', { price: 200 })).rejects.toThrow(NotFoundError);
    });

    it('prevents id overwrite', async () => {
      const { data: created } = await driver.create<any>('product', { name: 'Test', price: 100 });
      const { data } = await driver.update<any>('product', created.id, { id: 'hacked' } as any);
      expect(data.id).toBe(created.id);
    });
  });

  describe('delete (soft)', () => {
    it('sets deletedAt instead of removing', async () => {
      const { data: created } = await driver.create<any>('product', { name: 'Test', price: 100 });
      const { data } = await driver.delete<any>('product', created.id);
      expect(data.deletedAt).toBeDefined();
      expect(data.deletedAt).not.toBeNull();
    });

    it('throws NotFoundError when deleting already deleted', async () => {
      const { data: created } = await driver.create<any>('product', { name: 'Test', price: 100 });
      await driver.delete('product', created.id);
      await expect(driver.delete('product', created.id)).rejects.toThrow(NotFoundError);
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

    it('excludes soft-deleted records', async () => {
      const all = await driver.list<any>('product', {});
      await driver.delete('product', all.items[0].id);
      const result = await driver.list('product', {});
      expect(result.items).toHaveLength(2);
    });
  });

  describe('count', () => {
    it('counts non-deleted records', async () => {
      await driver.create('product', { name: 'A', price: 100 });
      await driver.create('product', { name: 'B', price: 200 });
      expect(await driver.count('product')).toBe(2);
    });

    it('counts with filter', async () => {
      await driver.create('product', { name: 'A', price: 100 });
      await driver.create('product', { name: 'B', price: 200 });
      expect(await driver.count('product', { price__gte: 200 })).toBe(1);
    });
  });

  describe('bulk operations', () => {
    it('bulk creates', async () => {
      const { data } = await driver.bulkCreate<any>('product', [
        { name: 'A', price: 100 },
        { name: 'B', price: 200 },
      ]);
      expect(data).toHaveLength(2);
      expect(await driver.count('product')).toBe(2);
    });

    it('bulk updates', async () => {
      const { data: created } = await driver.bulkCreate<any>('product', [
        { name: 'A', price: 100 },
        { name: 'B', price: 200 },
      ]);
      const { data } = await driver.bulkUpdate<any>('product', [
        { id: created[0].id, data: { price: 999 } },
        { id: created[1].id, data: { price: 888 } },
      ]);
      expect(data[0].price).toBe(999);
      expect(data[1].price).toBe(888);
    });

    it('bulk deletes', async () => {
      const { data: created } = await driver.bulkCreate<any>('product', [
        { name: 'A', price: 100 },
        { name: 'B', price: 200 },
      ]);
      const { data } = await driver.bulkDelete('product', [created[0].id, created[1].id]);
      expect(data.count).toBe(2);
      expect(await driver.count('product')).toBe(0);
    });
  });

  describe('seed management', () => {
    it('creates records with deterministic IDs', async () => {
      driver.seed('product', [
        { name: 'Seed A', price: 100 },
        { name: 'Seed B', price: 200 },
      ], TestProduct);

      const a = await driver.get<any>('product', 'seed:product:0');
      expect(a.data.id).toBe('seed:product:0');
      expect(a.data.name).toBe('Seed A');

      const b = await driver.get<any>('product', 'seed:product:1');
      expect(b.data.id).toBe('seed:product:1');
      expect(b.data.name).toBe('Seed B');
    });

    it('applies defaults on seed records', async () => {
      driver.seed('product', [{ name: 'Seed', price: 100 }], TestProduct);
      const { data } = await driver.get<any>('product', 'seed:product:0');
      expect(data.stock).toBe(0);
      expect(data.isActive).toBe(true);
    });

    it('upserts on re-seed', async () => {
      driver.seed('product', [{ name: 'Old', price: 100 }], TestProduct);
      driver.seed('product', [{ name: 'New', price: 200 }], TestProduct);
      const { data } = await driver.get<any>('product', 'seed:product:0');
      expect(data.name).toBe('New');
      expect(data.price).toBe(200);
    });

    it('tracks seed version', () => {
      expect(driver.getSeedVersion()).toBeNull();
      driver.setSeedVersion('abc123');
      expect(driver.getSeedVersion()).toBe('abc123');
    });

    it('clears all records for a resource', async () => {
      await driver.create('product', { name: 'A', price: 100 });
      await driver.create('product', { name: 'B', price: 200 });
      driver.clear('product');
      expect(await driver.count('product')).toBe(0);
    });
  });

  describe('without entity class', () => {
    it('works without registered entity (no validation/defaults)', async () => {
      const { data } = await driver.create<any>('unknown', { foo: 'bar' });
      expect(data.id).toBeDefined();
      expect(data.foo).toBe('bar');
    });
  });
});

// --- localStorage driver tests ---

describe('LocalDriver (localStorage)', () => {
  let driver: LocalDriver;
  let storage: Record<string, string>;

  beforeEach(() => {
    storage = {};
    const mockLocalStorage = {
      getItem: (key: string) => storage[key] ?? null,
      setItem: (key: string, value: string) => { storage[key] = value; },
      removeItem: (key: string) => { delete storage[key]; },
    };
    (globalThis as any).localStorage = mockLocalStorage;

    driver = new LocalDriver({ type: 'local', persist: 'localStorage' });
    driver.registerEntity('product', TestProduct);
  });

  it('creates and retrieves records via localStorage', async () => {
    const { data } = await driver.create<any>('product', { name: 'LS Test', price: 100 });
    expect(data.name).toBe('LS Test');

    const { data: fetched } = await driver.get<any>('product', data.id);
    expect(fetched.name).toBe('LS Test');
  });

  it('persists data in localStorage keys', async () => {
    await driver.create<any>('product', { id: 'test-1', name: 'Test', price: 100 });
    expect(storage['fauxbase:product:test-1']).toBeDefined();
    expect(storage['fauxbase:__index:product']).toContain('test-1');
  });

  it('lists records from localStorage', async () => {
    await driver.create('product', { name: 'A', price: 100 });
    await driver.create('product', { name: 'B', price: 200 });
    const result = await driver.list('product', {});
    expect(result.items).toHaveLength(2);
  });

  it('updates records in localStorage', async () => {
    const { data: created } = await driver.create<any>('product', { name: 'Test', price: 100 });
    const { data } = await driver.update<any>('product', created.id, { price: 999 });
    expect(data.price).toBe(999);
  });

  it('soft-deletes records in localStorage', async () => {
    const { data: created } = await driver.create<any>('product', { name: 'Test', price: 100 });
    await driver.delete('product', created.id);
    const list = await driver.list('product', {});
    expect(list.items).toHaveLength(0);
  });

  it('removes records from index on clear', async () => {
    await driver.create('product', { id: 'x', name: 'A', price: 100 });
    driver.clear('product');
    expect(storage['fauxbase:product:x']).toBeUndefined();
    expect(storage['fauxbase:__index:product']).toBeUndefined();
  });

  it('stores and retrieves seed version', () => {
    driver.setSeedVersion('v1');
    expect(storage['fauxbase:__meta:_seedVersion']).toBe('v1');
    expect(driver.getSeedVersion()).toBe('v1');
  });

  it('seeds via localStorage', async () => {
    driver.seed('product', [{ name: 'Seeded', price: 50 }], TestProduct);
    const { data } = await driver.get<any>('product', 'seed:product:0');
    expect(data.name).toBe('Seeded');
  });
});
