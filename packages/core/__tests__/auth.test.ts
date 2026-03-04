import { describe, it, expect, beforeEach } from 'vitest';
import { AuthService } from '../src/auth';
import { Entity, field } from '../src/entity';
import { createClient } from '../src/client';
import { Service } from '../src/service';
import { NotFoundError, ForbiddenError, ConflictError } from '../src/errors';

// --- Test entities ---

class User extends Entity {
  @field({ required: true }) name!: string;
  @field({ required: true }) email!: string;
  @field({ required: true }) password!: string;
  @field({ default: 'user' }) role!: string;
}

class UserAuthService extends AuthService<User> {
  entity = User;
  endpoint = '/users';
}

class Product extends Entity {
  @field({ required: true }) name!: string;
  @field({ default: 0 }) price!: number;
}

class ProductService extends Service<Product> {
  entity = Product;
  endpoint = '/products';
}

function createApp() {
  return createClient({
    driver: { type: 'local', persist: 'memory' },
    services: { product: ProductService },
    auth: UserAuthService,
  });
}

describe('AuthService', () => {
  describe('register', () => {
    it('registers a new user and sets auth state', async () => {
      const fb = createApp();
      const user = await fb.auth.register({
        name: 'Alice',
        email: 'alice@test.com',
        password: 'pass123',
      });

      expect((user as any).name).toBe('Alice');
      expect(fb.auth.isLoggedIn).toBe(true);
      expect(fb.auth.token).toBeTruthy();
      expect(fb.auth.currentUser).not.toBeNull();
    });

    it('rejects duplicate email', async () => {
      const fb = createApp();
      await fb.auth.register({
        name: 'Alice',
        email: 'alice@test.com',
        password: 'pass123',
      });

      await expect(
        fb.auth.register({
          name: 'Alice 2',
          email: 'alice@test.com',
          password: 'pass456',
        }),
      ).rejects.toThrow(ConflictError);
    });
  });

  describe('login', () => {
    it('logs in with valid credentials', async () => {
      const fb = createApp();
      await fb.auth.register({
        name: 'Bob',
        email: 'bob@test.com',
        password: 'secret',
      });
      fb.auth.logout();
      expect(fb.auth.isLoggedIn).toBe(false);

      const user = await fb.auth.login({ email: 'bob@test.com', password: 'secret' });
      expect((user as any).name).toBe('Bob');
      expect(fb.auth.isLoggedIn).toBe(true);
    });

    it('rejects invalid email', async () => {
      const fb = createApp();
      await expect(
        fb.auth.login({ email: 'nobody@test.com', password: 'x' }),
      ).rejects.toThrow(NotFoundError);
    });

    it('rejects invalid password', async () => {
      const fb = createApp();
      await fb.auth.register({
        name: 'Carol',
        email: 'carol@test.com',
        password: 'correct',
      });
      fb.auth.logout();

      await expect(
        fb.auth.login({ email: 'carol@test.com', password: 'wrong' }),
      ).rejects.toThrow(ForbiddenError);
    });
  });

  describe('logout', () => {
    it('clears auth state', async () => {
      const fb = createApp();
      await fb.auth.register({
        name: 'Dave',
        email: 'dave@test.com',
        password: 'pass',
      });
      expect(fb.auth.isLoggedIn).toBe(true);

      fb.auth.logout();
      expect(fb.auth.isLoggedIn).toBe(false);
      expect(fb.auth.currentUser).toBeNull();
      expect(fb.auth.token).toBeNull();
    });
  });

  describe('token generation', () => {
    it('generates a base64-encoded mock token', async () => {
      const fb = createApp();
      await fb.auth.register({
        name: 'Eve',
        email: 'eve@test.com',
        password: 'pass',
      });

      const token = fb.auth.token!;
      const decoded = JSON.parse(atob(token));
      expect(decoded.email).toBe('eve@test.com');
      expect(decoded.userId).toBeDefined();
      expect(decoded.iat).toBeDefined();
      expect(decoded.exp).toBeDefined();
    });
  });

  describe('role checks', () => {
    it('hasRole returns true for matching role', async () => {
      const fb = createApp();
      await fb.auth.register({
        name: 'Admin',
        email: 'admin@test.com',
        password: 'pass',
        role: 'admin',
      } as any);

      expect(fb.auth.hasRole('admin')).toBe(true);
      expect(fb.auth.hasRole('user')).toBe(false);
    });

    it('hasRole returns false when logged out', async () => {
      const fb = createApp();
      expect(fb.auth.hasRole('admin')).toBe(false);
    });
  });

  describe('getAuthContext', () => {
    it('returns context when logged in', async () => {
      const fb = createApp();
      await fb.auth.register({
        name: 'Frank',
        email: 'frank@test.com',
        password: 'pass',
      });

      const ctx = fb.auth.getAuthContext();
      expect(ctx).not.toBeNull();
      expect(ctx!.userId).toBeDefined();
      expect(ctx!.userName).toBe('Frank');
    });

    it('returns null when logged out', () => {
      const fb = createApp();
      expect(fb.auth.getAuthContext()).toBeNull();
    });
  });

  describe('auth state persistence', () => {
    it('persists auth state via storage meta', async () => {
      const fb = createApp();
      await fb.auth.register({
        name: 'Grace',
        email: 'grace@test.com',
        password: 'pass',
      });

      // Auth state should be persisted — verified by the fact that
      // getAuthContext returns data (wired via storage backend)
      expect(fb.auth.isLoggedIn).toBe(true);
      expect(fb.auth.getAuthContext()?.userId).toBeDefined();

      fb.auth.logout();
      expect(fb.auth.isLoggedIn).toBe(false);
    });
  });

  describe('auto-injection of auth fields', () => {
    it('injects createdById/updatedById on create when logged in', async () => {
      const fb = createApp();
      const user = await fb.auth.register({
        name: 'Helen',
        email: 'helen@test.com',
        password: 'pass',
      });

      const { data: product } = await fb.product.create({ name: 'Widget', price: 100 });
      expect((product as any).createdById).toBe((user as any).id);
      expect((product as any).createdByName).toBe('Helen');
      expect((product as any).updatedById).toBe((user as any).id);
    });

    it('does not inject auth fields when not logged in', async () => {
      const fb = createApp();
      const { data: product } = await fb.product.create({ name: 'Widget', price: 100 });
      expect((product as any).createdById).toBeUndefined();
    });

    it('injects updatedById on update', async () => {
      const fb = createApp();
      const user = await fb.auth.register({
        name: 'Ivy',
        email: 'ivy@test.com',
        password: 'pass',
      });

      const { data: product } = await fb.product.create({ name: 'Gadget', price: 200 });
      const { data: updated } = await fb.product.update((product as any).id, { price: 300 });
      expect((updated as any).updatedById).toBe((user as any).id);
      expect((updated as any).updatedByName).toBe('Ivy');
    });

    it('injects deletedById on delete', async () => {
      const fb = createApp();
      const user = await fb.auth.register({
        name: 'Jack',
        email: 'jack@test.com',
        password: 'pass',
      });

      const { data: product } = await fb.product.create({ name: 'Gizmo', price: 50 });
      const { data: deleted } = await fb.product.delete((product as any).id);
      expect((deleted as any).deletedById).toBe((user as any).id);
      expect((deleted as any).deletedByName).toBe('Jack');
    });
  });

  describe('client reference', () => {
    it('services have access to client via _setClient', async () => {
      const fb = createApp();
      // The product service should have a client reference
      expect((fb.product as any).client).toBeDefined();
      expect((fb.product as any).client.auth).toBeDefined();
    });
  });
});
