import { describe, it, expect, vi } from 'vitest';
import { createClient } from '../src/client';
import { Service } from '../src/service';
import { AuthService } from '../src/auth';
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

  it('creates client with http driver', () => {
    vi.stubGlobal('fetch', vi.fn());
    const fb = createClient({
      driver: { type: 'http', baseUrl: 'http://localhost' },
      services: { product: ProductService },
    });
    expect(fb.product).toBeInstanceOf(ProductService);
    vi.unstubAllGlobals();
  });

  it('supports hybrid mode with per-service overrides', async () => {
    vi.stubGlobal('fetch', vi.fn());
    const fb = createClient({
      driver: { type: 'local' },
      services: { product: ProductService, category: CategoryService },
      overrides: {
        product: { driver: { type: 'http', baseUrl: 'http://localhost' } },
      },
    });
    // product uses HTTP, category uses local
    expect(fb.product).toBeInstanceOf(ProductService);
    expect(fb.category).toBeInstanceOf(CategoryService);

    // category (local) still works normally
    const { data } = await fb.category.create({ name: 'Test Cat' });
    expect(data.name).toBe('Test Cat');
    vi.unstubAllGlobals();
  });

  describe('with auth', () => {
    class User extends Entity {
      @field({ required: true }) name!: string;
      @field({ required: true }) email!: string;
      @field({ required: true }) password!: string;
      @field({ default: 'user' }) role!: string;
    }

    class UserAuth extends AuthService<User> {
      entity = User;
      endpoint = '/users';
    }

    it('creates client with auth service', () => {
      const fb = createClient({
        driver: { type: 'local', persist: 'memory' },
        services: { product: ProductService },
        auth: UserAuth,
      });

      expect(fb.auth).toBeInstanceOf(UserAuth);
      expect(fb.auth.isLoggedIn).toBe(false);
      expect(fb.product).toBeInstanceOf(ProductService);
    });

    it('sets client reference on all services', () => {
      const fb = createClient({
        driver: { type: 'local', persist: 'memory' },
        services: { product: ProductService },
        auth: UserAuth,
      });

      expect((fb.product as any).client).toBeDefined();
      expect((fb.product as any).client.auth).toBeInstanceOf(UserAuth);
    });
  });
});
