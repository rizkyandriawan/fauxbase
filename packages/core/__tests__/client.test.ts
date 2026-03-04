import { describe, it, expect } from 'vitest';
import { createClient } from '../src/client';
import { Service } from '../src/service';
import { Entity, field } from '../src/entity';
import { seed, computeSeedVersion } from '../src/seed';

class Category extends Entity {
  @field({ required: true }) name!: string;
}

class Product extends Entity {
  @field({ required: true }) name!: string;
  @field({ default: 0 })     price!: number;
}

class CategoryService extends Service<Category> {
  entity = Category;
  endpoint = '/categories';
}

class ProductService extends Service<Product> {
  entity = Product;
  endpoint = '/products';
}

describe('createClient', () => {
  it('creates typed client with service keys', () => {
    const fb = createClient({
      driver: { type: 'local', persist: 'memory' },
      services: { product: ProductService, category: CategoryService },
    });

    expect(fb.product).toBeInstanceOf(ProductService);
    expect(fb.category).toBeInstanceOf(CategoryService);
  });

  it('services are wired and functional', async () => {
    const fb = createClient({
      driver: { type: 'local', persist: 'memory' },
      services: { product: ProductService },
    });

    const { data } = await fb.product.create({ name: 'Test' });
    expect(data.name).toBe('Test');

    const result = await fb.product.list();
    expect(result.items).toHaveLength(1);
  });

  it('applies seeds on first load', async () => {
    const fb = createClient({
      driver: { type: 'local', persist: 'memory' },
      services: { product: ProductService, category: CategoryService },
      seeds: [
        seed(Product, [{ name: 'Seeded', price: 100 }]),
        seed(Category, [{ name: 'Cat A' }]),
      ],
    });

    const products = await fb.product.list();
    expect(products.items).toHaveLength(1);
    expect(products.items[0].name).toBe('Seeded');

    const categories = await fb.category.list();
    expect(categories.items).toHaveLength(1);
  });

  it('seed records have deterministic IDs', async () => {
    const fb = createClient({
      driver: { type: 'local', persist: 'memory' },
      services: { product: ProductService },
      seeds: [seed(Product, [{ name: 'A' }, { name: 'B' }])],
    });

    const { data } = await fb.product.get('seed:product:0');
    expect(data.name).toBe('A');
  });

  it('defaults to local memory driver', async () => {
    const fb = createClient({
      services: { product: ProductService },
    });

    const { data } = await fb.product.create({ name: 'Works' });
    expect(data.name).toBe('Works');
  });

  it('throws for http driver (not implemented)', () => {
    expect(() =>
      createClient({
        driver: { type: 'http', baseUrl: 'http://localhost' },
        services: { product: ProductService },
      }),
    ).toThrow('HttpDriver not implemented');
  });
});
