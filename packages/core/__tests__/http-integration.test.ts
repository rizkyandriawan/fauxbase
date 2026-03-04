import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createClient } from '../src/client';
import { Service } from '../src/service';
import { AuthService } from '../src/auth';
import { Entity, field } from '../src/entity';

class Product extends Entity {
  @field({ required: true }) name!: string;
  @field({ default: 0 }) price!: number;
}

class ProductService extends Service<Product> {
  entity = Product;
  endpoint = '/products';
}

class Order extends Entity {
  @field({ required: true }) productId!: string;
  @field({ default: 1 }) quantity!: number;
}

class OrderService extends Service<Order> {
  entity = Order;
  endpoint = '/orders';
}

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

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

function jsonResponse(data: any, status = 200) {
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(data),
  });
}

describe('HTTP integration', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it('creates client with HTTP driver', async () => {
    const fb = createClient({
      driver: { type: 'http', baseUrl: 'http://localhost:3000', preset: 'default' },
      services: { product: ProductService },
    });

    mockFetch.mockReturnValueOnce(jsonResponse({
      items: [{ id: '1', name: 'Foo', price: 100 }],
      meta: { page: 1, size: 20, totalItems: 1, totalPages: 1 },
    }));

    const result = await fb.product.list();
    expect(result.items).toHaveLength(1);
    expect(result.items[0].name).toBe('Foo');
  });

  describe('hybrid mode', () => {
    it('uses different drivers per service', async () => {
      const fb = createClient({
        driver: { type: 'local' },
        services: { product: ProductService, order: OrderService },
        overrides: {
          product: { driver: { type: 'http', baseUrl: 'http://localhost:3000', preset: 'default' } },
        },
      });

      // Product uses HTTP
      mockFetch.mockReturnValueOnce(jsonResponse({
        items: [{ id: '1', name: 'HTTP Product', price: 50 }],
        meta: { page: 1, size: 20, totalItems: 1, totalPages: 1 },
      }));

      const products = await fb.product.list();
      expect(products.items[0].name).toBe('HTTP Product');
      expect(mockFetch).toHaveBeenCalledTimes(1);

      // Order uses local
      const { data: order } = await fb.order.create({ productId: '1', quantity: 2 });
      expect(order.productId).toBe('1');
      // No additional fetch calls for local
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });
  });

  describe('HTTP auth', () => {
    it('login POSTs to preset auth endpoint', async () => {
      const fb = createClient({
        driver: { type: 'http', baseUrl: 'http://localhost:3000', preset: 'default' },
        services: { product: ProductService },
        auth: UserAuth,
      });

      mockFetch.mockReturnValueOnce(jsonResponse({
        token: 'jwt-token-123',
        user: { id: 'u1', email: 'test@test.com', name: 'Test', role: 'admin' },
      }));

      const user = await fb.auth.login({ email: 'test@test.com', password: 'secret' });
      expect(user.email).toBe('test@test.com');
      expect(fb.auth.isLoggedIn).toBe(true);
      expect(fb.auth.token).toBe('jwt-token-123');

      // Verify it called the correct URL
      expect(mockFetch.mock.calls[0][0]).toBe('http://localhost:3000/auth/login');
      expect(mockFetch.mock.calls[0][1].method).toBe('POST');
    });

    it('register POSTs to preset register endpoint', async () => {
      const fb = createClient({
        driver: { type: 'http', baseUrl: 'http://localhost:3000', preset: 'default' },
        services: { product: ProductService },
        auth: UserAuth,
      });

      mockFetch.mockReturnValueOnce(jsonResponse({
        token: 'new-token',
        user: { id: 'u2', email: 'new@test.com', name: 'New', role: 'user' },
      }));

      const user = await fb.auth.register({
        email: 'new@test.com',
        password: 'pass',
        name: 'New',
      } as any);

      expect(user.email).toBe('new@test.com');
      expect(fb.auth.isLoggedIn).toBe(true);
    });

    it('injects auth token into subsequent HTTP requests', async () => {
      const fb = createClient({
        driver: { type: 'http', baseUrl: 'http://localhost:3000', preset: 'default' },
        services: { product: ProductService },
        auth: UserAuth,
      });

      // Login
      mockFetch.mockReturnValueOnce(jsonResponse({
        token: 'my-token',
        user: { id: 'u1', email: 'test@test.com', name: 'Test' },
      }));
      await fb.auth.login({ email: 'test@test.com', password: 'pass' });

      // Now fetch products — should have auth header
      mockFetch.mockReturnValueOnce(jsonResponse({ items: [], meta: {} }));
      await fb.product.list();

      const headers = mockFetch.mock.calls[1][1].headers;
      expect(headers['Authorization']).toBe('Bearer my-token');
    });

    it('logout clears auth state', async () => {
      const fb = createClient({
        driver: { type: 'http', baseUrl: 'http://localhost:3000', preset: 'default' },
        services: {},
        auth: UserAuth,
      });

      mockFetch.mockReturnValueOnce(jsonResponse({
        token: 'token',
        user: { id: 'u1', email: 'test@test.com' },
      }));

      await fb.auth.login({ email: 'test@test.com', password: 'pass' });
      expect(fb.auth.isLoggedIn).toBe(true);

      fb.auth.logout();
      expect(fb.auth.isLoggedIn).toBe(false);
      expect(fb.auth.token).toBeNull();
    });
  });
});
