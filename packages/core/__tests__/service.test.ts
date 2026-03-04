import { describe, it, expect, beforeEach } from 'vitest';
import { Service, beforeCreate, beforeUpdate, afterCreate, afterUpdate } from '../src/service';
import { Entity, field } from '../src/entity';
import { LocalDriver } from '../src/drivers/local';
import { ConflictError, ValidationError } from '../src/errors';

class Item extends Entity {
  @field({ required: true }) name!: string;
  @field({ default: 0 })     count!: number;
}

class ItemService extends Service<Item> {
  entity = Item;
  endpoint = '/items';

  hookLog: string[] = [];

  @beforeCreate()
  checkUnique(data: Partial<Item>, existing: Item[]) {
    if (existing.some((e: any) => e.name === data.name)) {
      throw new ConflictError(`"${data.name}" already exists`);
    }
    this.hookLog.push('beforeCreate');
  }

  @beforeUpdate()
  logUpdate(_id: string, _data: Partial<Item>) {
    this.hookLog.push('beforeUpdate');
  }

  @afterCreate()
  logAfterCreate(_entity: Item) {
    this.hookLog.push('afterCreate');
  }

  @afterUpdate()
  logAfterUpdate(_entity: Item) {
    this.hookLog.push('afterUpdate');
  }

  async getByName(name: string) {
    return this.list({ filter: { name } });
  }
}

// Service without hooks
class PlainService extends Service<Item> {
  entity = Item;
  endpoint = '/plain';
}

describe('Service', () => {
  let service: ItemService;

  beforeEach(() => {
    const driver = new LocalDriver({ type: 'local', persist: 'memory' });
    driver.registerEntity('item', Item);
    service = new ItemService();
    service._init(driver, 'item');
    service.hookLog = [];
  });

  describe('CRUD delegation', () => {
    it('creates via driver', async () => {
      const { data } = await service.create({ name: 'Test' });
      expect(data.name).toBe('Test');
      expect((data as any).id).toBeDefined();
    });

    it('gets via driver', async () => {
      const { data: created } = await service.create({ name: 'Test' });
      const { data } = await service.get((created as any).id);
      expect(data.name).toBe('Test');
    });

    it('lists via driver', async () => {
      await service.create({ name: 'A' });
      await service.create({ name: 'B' });
      const result = await service.list();
      expect(result.items).toHaveLength(2);
    });

    it('updates via driver', async () => {
      const { data: created } = await service.create({ name: 'Test' });
      const { data } = await service.update((created as any).id, { name: 'Updated' });
      expect(data.name).toBe('Updated');
    });

    it('deletes via driver', async () => {
      const { data: created } = await service.create({ name: 'Test' });
      await service.delete((created as any).id);
      const result = await service.list();
      expect(result.items).toHaveLength(0);
    });

    it('counts via driver', async () => {
      await service.create({ name: 'A' });
      await service.create({ name: 'B' });
      expect(await service.count()).toBe(2);
      expect(await service.count({ name: 'A' })).toBe(1);
    });
  });

  describe('hooks', () => {
    it('runs beforeCreate and afterCreate', async () => {
      await service.create({ name: 'Test' });
      expect(service.hookLog).toEqual(['beforeCreate', 'afterCreate']);
    });

    it('runs beforeUpdate and afterUpdate', async () => {
      const { data } = await service.create({ name: 'Test' });
      service.hookLog = [];
      await service.update((data as any).id, { name: 'Updated' });
      expect(service.hookLog).toEqual(['beforeUpdate', 'afterUpdate']);
    });

    it('beforeCreate can throw to abort', async () => {
      await service.create({ name: 'Unique' });
      await expect(service.create({ name: 'Unique' })).rejects.toThrow(ConflictError);
    });

    it('beforeCreate receives existing items', async () => {
      await service.create({ name: 'A' });
      await service.create({ name: 'B' });
      // The hook checks uniqueness against existing items
      await expect(service.create({ name: 'A' })).rejects.toThrow(ConflictError);
    });
  });

  describe('custom methods', () => {
    it('custom query methods work', async () => {
      await service.create({ name: 'FindMe' });
      await service.create({ name: 'Other' });
      const result = await service.getByName('FindMe');
      expect(result.items).toHaveLength(1);
      expect(result.items[0].name).toBe('FindMe');
    });
  });

  describe('bulk operations', () => {
    it('bulk create', async () => {
      const { data } = await service.bulk.create([{ name: 'X' }, { name: 'Y' }]);
      expect(data).toHaveLength(2);
    });

    it('bulk update', async () => {
      const { data: created } = await service.bulk.create([{ name: 'X' }, { name: 'Y' }]);
      const { data } = await service.bulk.update([
        { id: (created[0] as any).id, data: { count: 10 } },
      ]);
      expect((data[0] as any).count).toBe(10);
    });

    it('bulk delete', async () => {
      const { data: created } = await service.bulk.create([{ name: 'X' }, { name: 'Y' }]);
      await service.bulk.delete([(created[0] as any).id, (created[1] as any).id]);
      expect(await service.count()).toBe(0);
    });
  });

  describe('service without hooks', () => {
    it('works without any hooks', async () => {
      const driver = new LocalDriver({ type: 'local', persist: 'memory' });
      driver.registerEntity('plain', Item);
      const plain = new PlainService();
      plain._init(driver, 'plain');

      const { data } = await plain.create({ name: 'NoHooks' });
      expect(data.name).toBe('NoHooks');
    });
  });
});
