import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderHook, act, waitFor } from '@testing-library/react';
import { createClient, Entity, field, Service, AuthService } from 'fauxbase';
import { FauxbaseProvider } from '../src/context';
import { useAuth } from '../src/use-auth';

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

class Item extends Entity {
  @field({ required: true }) name!: string;
}

class ItemService extends Service<Item> {
  entity = Item;
  endpoint = '/items';
}

function setupWithAuth() {
  const client = createClient({
    driver: { type: 'local', persist: 'memory' },
    services: { item: ItemService },
    auth: UserAuth,
  });
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <FauxbaseProvider client={client}>{children}</FauxbaseProvider>
  );
  return { client, wrapper };
}

function setupWithoutAuth() {
  const client = createClient({
    driver: { type: 'local', persist: 'memory' },
    services: { item: ItemService },
  });
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <FauxbaseProvider client={client}>{children}</FauxbaseProvider>
  );
  return { client, wrapper };
}

describe('useAuth', () => {
  it('returns initial unauthenticated state', () => {
    const { wrapper } = setupWithAuth();
    const { result } = renderHook(() => useAuth<User>(), { wrapper });

    expect(result.current.isLoggedIn).toBe(false);
    expect(result.current.user).toBeNull();
    expect(result.current.token).toBeNull();
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('registers a user and updates state', async () => {
    const { wrapper } = setupWithAuth();
    const { result } = renderHook(() => useAuth<User>(), { wrapper });

    await act(async () => {
      await result.current.register({
        name: 'Alice',
        email: 'alice@test.com',
        password: 'pass',
      });
    });

    expect(result.current.isLoggedIn).toBe(true);
    expect(result.current.user).not.toBeNull();
    expect(result.current.token).toBeTruthy();
  });

  it('logs in and updates state', async () => {
    const { wrapper, client } = setupWithAuth();

    // Register first
    await client.auth.register({
      name: 'Bob',
      email: 'bob@test.com',
      password: 'secret',
    });
    client.auth.logout();

    const { result } = renderHook(() => useAuth<User>(), { wrapper });

    await act(async () => {
      await result.current.login({ email: 'bob@test.com', password: 'secret' });
    });

    expect(result.current.isLoggedIn).toBe(true);
  });

  it('logs out and updates state', async () => {
    const { wrapper } = setupWithAuth();
    const { result } = renderHook(() => useAuth<User>(), { wrapper });

    await act(async () => {
      await result.current.register({
        name: 'Carol',
        email: 'carol@test.com',
        password: 'pass',
      });
    });

    expect(result.current.isLoggedIn).toBe(true);

    act(() => {
      result.current.logout();
    });

    expect(result.current.isLoggedIn).toBe(false);
    expect(result.current.user).toBeNull();
  });

  it('handles login errors', async () => {
    const { wrapper } = setupWithAuth();
    const { result } = renderHook(() => useAuth<User>(), { wrapper });

    await act(async () => {
      try {
        await result.current.login({ email: 'nobody@test.com', password: 'wrong' });
      } catch {
        // expected
      }
    });

    expect(result.current.error).not.toBeNull();
    expect(result.current.isLoggedIn).toBe(false);
  });

  it('checks roles', async () => {
    const { wrapper } = setupWithAuth();
    const { result } = renderHook(() => useAuth<User>(), { wrapper });

    await act(async () => {
      await result.current.register({
        name: 'Admin',
        email: 'admin@test.com',
        password: 'pass',
        role: 'admin',
      } as any);
    });

    expect(result.current.hasRole('admin')).toBe(true);
    expect(result.current.hasRole('user')).toBe(false);
  });

  it('throws without auth config', () => {
    const { wrapper } = setupWithoutAuth();
    expect(() => {
      renderHook(() => useAuth(), { wrapper });
    }).toThrow('useAuth requires auth to be configured');
  });
});
