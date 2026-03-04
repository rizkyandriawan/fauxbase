import { describe, it, expect, beforeEach, vi } from 'vitest';
import { get } from 'svelte/store';
import { createClient, Entity, field, Service, AuthService, seed } from 'fauxbase';
import {
  createFauxbaseContext,
  useList,
  useGet,
  useMutation,
  useAuth,
} from '../src/index';

// --- Test entities ---

class Todo extends Entity {
  @field({ required: true }) title!: string;
  @field({ default: false }) done!: boolean;
}

class TodoService extends Service<Todo> {
  entity = Todo;
  endpoint = '/todos';
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

const todoSeed = seed(Todo, [
  { title: 'Buy milk', done: false },
  { title: 'Write tests', done: true },
]);

function createApp() {
  return createClient({
    driver: { type: 'local', persist: 'memory' },
    services: { todo: TodoService },
    seeds: [todoSeed],
  });
}

function createAuthApp() {
  return createClient({
    driver: { type: 'local', persist: 'memory' },
    services: { todo: TodoService },
    seeds: [todoSeed],
    auth: UserAuth,
  });
}

// Helper to wait for async store updates
const tick = () => new Promise(resolve => setTimeout(resolve, 0));

describe('useList', () => {
  let client: ReturnType<typeof createApp>;
  let ctx: ReturnType<typeof createFauxbaseContext>;

  beforeEach(() => {
    client = createApp();
    ctx = createFauxbaseContext(client);
  });

  it('fetches items', async () => {
    const result = useList(client.todo, undefined, undefined, ctx) as any;
    await tick();

    expect(get(result.items)).toHaveLength(2);
    expect(get(result.loading)).toBe(false);
    expect(get(result.error)).toBeNull();
    expect(get(result.meta)).toBeDefined();

    result._destroy();
  });

  it('applies query filters', async () => {
    const result = useList(client.todo, { filter: { done: true } }, undefined, ctx) as any;
    await tick();

    expect(get(result.items)).toHaveLength(1);
    expect((get(result.items) as any[])[0].title).toBe('Write tests');

    result._destroy();
  });

  it('supports refetch', async () => {
    const result = useList(client.todo, undefined, undefined, ctx) as any;
    await tick();
    expect(get(result.items)).toHaveLength(2);

    await client.todo.create({ title: 'New item' } as any);
    result.refetch();
    await tick();

    expect(get(result.items)).toHaveLength(3);

    result._destroy();
  });

  it('auto-refetches on invalidation', async () => {
    const listResult = useList(client.todo, undefined, undefined, ctx) as any;
    const mutationResult = useMutation(client.todo, ctx);
    await tick();
    expect(get(listResult.items)).toHaveLength(2);

    await mutationResult.create({ title: 'Added via mutation' } as any);
    await tick();

    expect(get(listResult.items)).toHaveLength(3);

    listResult._destroy();
  });

  it('does not fetch when enabled is false', async () => {
    const result = useList(client.todo, undefined, { enabled: false }, ctx) as any;
    await tick();

    expect(get(result.items)).toHaveLength(0);

    result._destroy();
  });
});

describe('useGet', () => {
  let client: ReturnType<typeof createApp>;
  let ctx: ReturnType<typeof createFauxbaseContext>;

  beforeEach(() => {
    client = createApp();
    ctx = createFauxbaseContext(client);
  });

  it('fetches a record by id', async () => {
    const result = useGet(client.todo, 'seed:todo:0', undefined, ctx) as any;
    await tick();

    expect(get(result.loading)).toBe(false);
    expect((get(result.data) as any).title).toBe('Buy milk');
    expect(get(result.error)).toBeNull();

    result._destroy();
  });

  it('returns null when id is null', async () => {
    const result = useGet(client.todo, null, undefined, ctx) as any;
    await tick();

    expect(get(result.loading)).toBe(false);
    expect(get(result.data)).toBeNull();

    result._destroy();
  });

  it('handles errors', async () => {
    const result = useGet(client.todo, 'nonexistent', undefined, ctx) as any;
    await tick();

    expect(get(result.error)).toBeInstanceOf(Error);
    expect(get(result.data)).toBeNull();

    result._destroy();
  });
});

describe('useMutation', () => {
  let client: ReturnType<typeof createApp>;
  let ctx: ReturnType<typeof createFauxbaseContext>;

  beforeEach(() => {
    client = createApp();
    ctx = createFauxbaseContext(client);
  });

  it('creates a record', async () => {
    const result = useMutation(client.todo, ctx);
    const created = await result.create({ title: 'New todo' } as any);

    expect((created as any).title).toBe('New todo');
    expect(get(result.loading)).toBe(false);
  });

  it('updates a record', async () => {
    const result = useMutation(client.todo, ctx);
    const updated = await result.update('seed:todo:0', { title: 'Updated' } as any);

    expect((updated as any).title).toBe('Updated');
  });

  it('deletes a record', async () => {
    const result = useMutation(client.todo, ctx);
    const deleted = await result.remove('seed:todo:0');

    expect((deleted as any).deletedAt).not.toBeNull();
  });

  it('sets error on failure', async () => {
    const result = useMutation(client.todo, ctx);

    await expect(result.update('nonexistent', {} as any)).rejects.toThrow();
    expect(get(result.error)).toBeInstanceOf(Error);
  });
});

describe('useAuth', () => {
  let client: ReturnType<typeof createAuthApp>;
  let ctx: ReturnType<typeof createFauxbaseContext>;

  beforeEach(() => {
    client = createAuthApp();
    ctx = createFauxbaseContext(client);
  });

  it('starts logged out', () => {
    const result = useAuth(ctx);

    expect(get(result.isLoggedIn)).toBe(false);
    expect(get(result.user)).toBeNull();
    expect(get(result.token)).toBeNull();
  });

  it('registers and logs in', async () => {
    const result = useAuth(ctx);

    await result.register({ name: 'Alice', email: 'alice@test.com', password: 'secret' } as any);
    expect(get(result.isLoggedIn)).toBe(true);
    expect((get(result.user) as any).email).toBe('alice@test.com');
    expect(get(result.token)).toBeDefined();
  });

  it('logs in and out', async () => {
    const result = useAuth(ctx);

    await result.register({ name: 'Bob', email: 'bob@test.com', password: 'pass' } as any);

    result.logout();
    expect(get(result.isLoggedIn)).toBe(false);
    expect(get(result.user)).toBeNull();

    await result.login({ email: 'bob@test.com', password: 'pass' });
    expect(get(result.isLoggedIn)).toBe(true);
  });

  it('checks roles', async () => {
    const result = useAuth(ctx);

    await result.register({ name: 'Admin', email: 'admin@test.com', password: 'pass', role: 'admin' } as any);
    expect(result.hasRole('admin')).toBe(true);
    expect(result.hasRole('user')).toBe(false);
  });

  it('sets error on login failure', async () => {
    const result = useAuth(ctx);

    await expect(result.login({ email: 'nobody@test.com', password: 'wrong' })).rejects.toThrow();
    expect(get(result.error)).toBeInstanceOf(Error);
  });
});
