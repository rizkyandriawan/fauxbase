import { describe, it, expect, beforeEach, vi } from 'vitest';
import { defineComponent, h, nextTick } from 'vue';
import { mount, flushPromises } from '@vue/test-utils';
import { createClient, Entity, field, Service, AuthService, seed } from 'fauxbase';
import {
  FauxbasePlugin,
  provideFauxbase,
  useFauxbase,
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

// --- Helper: mount composable inside a component with plugin ---

function mountComposable<T>(
  client: any,
  composableFn: () => T,
): { result: T; wrapper: ReturnType<typeof mount> } {
  let result: T = undefined as any;

  const TestComponent = defineComponent({
    setup() {
      result = composableFn();
      return () => h('div');
    },
  });

  const wrapper = mount(TestComponent, {
    global: {
      plugins: [[FauxbasePlugin, { client }]],
    },
  });

  return { result, wrapper };
}

// --- Tests ---

describe('FauxbasePlugin + useFauxbase', () => {
  it('provides client via plugin', () => {
    const client = createApp();
    const { result } = mountComposable(client, () => useFauxbase());
    expect(result).toBe(client);
  });

  it('provides client via provideFauxbase', () => {
    const client = createApp();
    let result: any;

    const Parent = defineComponent({
      setup() {
        provideFauxbase(client);
        return () => h(Child);
      },
    });

    const Child = defineComponent({
      setup() {
        result = useFauxbase();
        return () => h('div');
      },
    });

    mount(Parent);
    expect(result).toBe(client);
  });
});

describe('useList', () => {
  let client: ReturnType<typeof createApp>;

  beforeEach(() => {
    client = createApp();
  });

  it('fetches items on mount', async () => {
    const { result } = mountComposable(client, () => useList(client.todo));
    expect(result.loading.value).toBe(true);

    await flushPromises();

    expect(result.loading.value).toBe(false);
    expect(result.items.value).toHaveLength(2);
    expect(result.meta.value).toBeDefined();
    expect(result.error.value).toBeNull();
  });

  it('applies query filters', async () => {
    const { result } = mountComposable(client, () =>
      useList(client.todo, { filter: { done: true } }),
    );

    await flushPromises();

    expect(result.items.value).toHaveLength(1);
    expect((result.items.value[0] as any).title).toBe('Write tests');
  });

  it('supports refetch', async () => {
    const { result } = mountComposable(client, () => useList(client.todo));
    await flushPromises();
    expect(result.items.value).toHaveLength(2);

    // Add a new item
    await client.todo.create({ title: 'New item' } as any);
    result.refetch();
    await flushPromises();

    expect(result.items.value).toHaveLength(3);
  });

  it('auto-refetches on invalidation from mutation', async () => {
    let listResult: any;
    let mutationResult: any;

    const TestComponent = defineComponent({
      setup() {
        listResult = useList(client.todo);
        mutationResult = useMutation(client.todo);
        return () => h('div');
      },
    });

    mount(TestComponent, {
      global: {
        plugins: [[FauxbasePlugin, { client }]],
      },
    });

    await flushPromises();
    expect(listResult.items.value).toHaveLength(2);

    await mutationResult.create({ title: 'Added via mutation' });
    await flushPromises();

    expect(listResult.items.value).toHaveLength(3);
  });

  it('does not fetch when enabled is false', async () => {
    const { result } = mountComposable(client, () =>
      useList(client.todo, undefined, { enabled: false }),
    );

    await flushPromises();
    expect(result.items.value).toHaveLength(0);
  });
});

describe('useGet', () => {
  let client: ReturnType<typeof createApp>;

  beforeEach(() => {
    client = createApp();
  });

  it('fetches a record by id', async () => {
    const { result } = mountComposable(client, () =>
      useGet(client.todo, 'seed:todo:0'),
    );

    await flushPromises();

    expect(result.loading.value).toBe(false);
    expect((result.data.value as any).title).toBe('Buy milk');
    expect(result.error.value).toBeNull();
  });

  it('returns null when id is null', async () => {
    const { result } = mountComposable(client, () =>
      useGet(client.todo, null),
    );

    await flushPromises();

    expect(result.loading.value).toBe(false);
    expect(result.data.value).toBeNull();
  });

  it('handles errors', async () => {
    const { result } = mountComposable(client, () =>
      useGet(client.todo, 'nonexistent'),
    );

    await flushPromises();

    expect(result.error.value).toBeInstanceOf(Error);
    expect(result.data.value).toBeNull();
  });
});

describe('useMutation', () => {
  let client: ReturnType<typeof createApp>;

  beforeEach(() => {
    client = createApp();
  });

  it('creates a record', async () => {
    const { result } = mountComposable(client, () => useMutation(client.todo));

    const created = await result.create({ title: 'New todo' } as any);
    expect((created as any).title).toBe('New todo');
    expect(result.loading.value).toBe(false);
  });

  it('updates a record', async () => {
    const { result } = mountComposable(client, () => useMutation(client.todo));

    const updated = await result.update('seed:todo:0', { title: 'Updated' } as any);
    expect((updated as any).title).toBe('Updated');
  });

  it('deletes a record', async () => {
    const { result } = mountComposable(client, () => useMutation(client.todo));

    const deleted = await result.remove('seed:todo:0');
    expect((deleted as any).deletedAt).not.toBeNull();
  });

  it('sets error on failure', async () => {
    const { result } = mountComposable(client, () => useMutation(client.todo));

    await expect(result.update('nonexistent', {} as any)).rejects.toThrow();
    expect(result.error.value).toBeInstanceOf(Error);
  });
});

describe('useAuth', () => {
  let client: ReturnType<typeof createAuthApp>;

  beforeEach(() => {
    client = createAuthApp();
  });

  it('starts logged out', () => {
    const { result } = mountComposable(client, () => useAuth());

    expect(result.isLoggedIn.value).toBe(false);
    expect(result.user.value).toBeNull();
    expect(result.token.value).toBeNull();
  });

  it('registers and logs in', async () => {
    const { result } = mountComposable(client, () => useAuth());

    await result.register({ name: 'Alice', email: 'alice@test.com', password: 'secret' } as any);
    expect(result.isLoggedIn.value).toBe(true);
    expect((result.user.value as any).email).toBe('alice@test.com');
    expect(result.token.value).toBeDefined();
  });

  it('logs in and out', async () => {
    const { result } = mountComposable(client, () => useAuth());

    await result.register({ name: 'Bob', email: 'bob@test.com', password: 'pass' } as any);

    result.logout();
    expect(result.isLoggedIn.value).toBe(false);
    expect(result.user.value).toBeNull();

    await result.login({ email: 'bob@test.com', password: 'pass' });
    expect(result.isLoggedIn.value).toBe(true);
  });

  it('checks roles', async () => {
    const { result } = mountComposable(client, () => useAuth());

    await result.register({ name: 'Admin', email: 'admin@test.com', password: 'pass', role: 'admin' } as any);
    expect(result.hasRole('admin')).toBe(true);
    expect(result.hasRole('user')).toBe(false);
  });

  it('sets error on login failure', async () => {
    const { result } = mountComposable(client, () => useAuth());

    await expect(result.login({ email: 'nobody@test.com', password: 'wrong' })).rejects.toThrow();
    expect(result.error.value).toBeInstanceOf(Error);
  });
});
