import { describe, it, expect } from 'vitest';
import { createClient, Entity, field, relation, computed, Service, beforeCreate, seed, ConflictError, NotFoundError } from '../src/index';

// --- Define entities ---

class Category extends Entity {
  @field({ required: true }) name!: string;
}

class Product extends Entity {
  @field({ required: true })          name!: string;
  @field({ required: true, min: 0 })  price!: number;
  @field({ default: 0 })              stock!: number;
  @field({ default: true })           isActive!: boolean;
  @relation('category')               categoryId!: string;
  @computed((p: any) => p.stock > 0 && p.isActive)
  available!: boolean;
}

// --- Define services ---

class CategoryService extends Service<Category> {
  entity = Category;
  endpoint = '/categories';
}

class ProductService extends Service<Product> {
  entity = Product;
  endpoint = '/products';

  @beforeCreate()
  ensureUniqueName(data: Partial<Product>, existing: Product[]) {
    if (existing.some((p: any) => p.name === data.name)) {
      throw new ConflictError(`Product "${data.name}" already exists`);
    }
  }

  async getByCategory(categoryId: string) {
    return this.list({
      filter: { categoryId, isActive: true },
      sort: { field: 'name', direction: 'asc' },
    });
  }

  async getAvailable() {
    return this.list({
      filter: { stock__gt: 0, isActive: true },
    });
  }
}

// --- Seeds ---

const categorySeed = seed(Category, [
  { name: 'Hair' },
  { name: 'Beard' },
]);

const productSeed = seed(Product, [
  { name: 'Hair Clay', price: 185000, categoryId: 'seed:category:0', stock: 50 },
  { name: 'Beard Oil', price: 125000, categoryId: 'seed:category:1', stock: 30 },
  { name: 'Hair Spray', price: 95000, categoryId: 'seed:category:0', stock: 0 },
]);

describe('Integration: full e2e flow', () => {
  function createApp() {
    return createClient({
      driver: { type: 'local', persist: 'memory' },
      services: { product: ProductService, category: CategoryService },
      seeds: [categorySeed, productSeed],
    });
  }

  it('seeds are applied on first load', async () => {
    const fb = createApp();
    const products = await fb.product.list();
    expect(products.items).toHaveLength(3);

    const categories = await fb.category.list();
    expect(categories.items).toHaveLength(2);
  });

  it('computed fields work on seeded data', async () => {
    const fb = createApp();
    const { data } = await fb.product.get('seed:product:0');
    expect((data as any).available).toBe(true);

    const { data: spray } = await fb.product.get('seed:product:2');
    expect((spray as any).available).toBe(false);
  });

  it('CRUD operations work', async () => {
    const fb = createApp();

    // Create
    const { data: newProduct } = await fb.product.create({
      name: 'Pomade',
      price: 150000,
      categoryId: 'seed:category:0',
      stock: 20,
    });
    expect((newProduct as any).id).toBeDefined();
    expect((newProduct as any).available).toBe(true);

    // Update
    const { data: updated } = await fb.product.update((newProduct as any).id, { stock: 0 });
    expect((updated as any).stock).toBe(0);
    expect((updated as any).available).toBe(false);
    expect((updated as any).version).toBe(2);

    // Delete (soft)
    await fb.product.delete((newProduct as any).id);
    const list = await fb.product.list();
    expect(list.items.find((p: any) => p.id === (newProduct as any).id)).toBeUndefined();
  });

  it('hooks prevent duplicates', async () => {
    const fb = createApp();
    await expect(
      fb.product.create({ name: 'Hair Clay', price: 100, categoryId: 'x' }),
    ).rejects.toThrow(ConflictError);
  });

  it('query operators work', async () => {
    const fb = createApp();

    // price >= 125000
    const expensive = await fb.product.list({ filter: { price__gte: 125000 } });
    expect(expensive.items).toHaveLength(2);

    // name contains "hair" (case-insensitive)
    const hair = await fb.product.list({ filter: { name__contains: 'hair' } });
    expect(hair.items).toHaveLength(2);

    // price between
    const mid = await fb.product.list({ filter: { price__between: [100000, 150000] } });
    expect(mid.items).toHaveLength(1);

    // category in
    const byCategory = await fb.product.list({
      filter: { categoryId__in: ['seed:category:1'] },
    });
    expect(byCategory.items).toHaveLength(1);
  });

  it('sorting works', async () => {
    const fb = createApp();
    const result = await fb.product.list({
      sort: { field: 'price', direction: 'asc' },
    });
    const prices = result.items.map((p: any) => p.price);
    expect(prices).toEqual([95000, 125000, 185000]);
  });

  it('pagination works', async () => {
    const fb = createApp();
    const page1 = await fb.product.list({ page: 1, size: 2 });
    expect(page1.items).toHaveLength(2);
    expect(page1.meta).toEqual({ page: 1, size: 2, totalItems: 3, totalPages: 2 });

    const page2 = await fb.product.list({ page: 2, size: 2 });
    expect(page2.items).toHaveLength(1);
  });

  it('custom service methods work', async () => {
    const fb = createApp();
    const hairProducts = await fb.product.getByCategory('seed:category:0');
    expect(hairProducts.items).toHaveLength(2); // Hair Clay + Hair Spray (both active, but spray has stock 0 — still isActive: true)

    const available = await fb.product.getAvailable();
    expect(available.items).toHaveLength(2); // Hair Clay (50) + Beard Oil (30)
  });

  it('count works with filter', async () => {
    const fb = createApp();
    expect(await fb.product.count()).toBe(3);
    expect(await fb.product.count({ categoryId: 'seed:category:0' })).toBe(2);
  });

  it('bulk operations work', async () => {
    const fb = createApp();

    const { data: bulkCreated } = await fb.product.bulk.create([
      { name: 'Bulk A', price: 50000, categoryId: 'seed:category:0' },
      { name: 'Bulk B', price: 60000, categoryId: 'seed:category:1' },
    ]);
    expect(bulkCreated).toHaveLength(2);

    expect(await fb.product.count()).toBe(5);

    await fb.product.bulk.delete(bulkCreated.map((p: any) => p.id));
    expect(await fb.product.count()).toBe(3);
  });
});
