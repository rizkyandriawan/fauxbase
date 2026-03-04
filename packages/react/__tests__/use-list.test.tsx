import { describe, it, expect, beforeEach, vi } from 'vitest';
import React from 'react';
import { renderHook, act, waitFor } from '@testing-library/react';
import { createClient, Entity, field, Service } from 'fauxbase';
import { FauxbaseProvider } from '../src/context';
import { useList } from '../src/use-list';
import { useMutation } from '../src/use-mutation';

class Todo extends Entity {
  @field({ required: true }) title!: string;
  @field({ default: false }) done!: boolean;
}

class TodoService extends Service<Todo> {
  entity = Todo;
  endpoint = '/todos';
}

function setup() {
  const client = createClient({
    driver: { type: 'local', persist: 'memory' },
    services: { todo: TodoService },
  });
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <FauxbaseProvider client={client}>{children}</FauxbaseProvider>
  );
  return { client, wrapper };
}

describe('useList', () => {
  it('fetches items on mount', async () => {
    const { client, wrapper } = setup();
    await client.todo.create({ title: 'Buy milk' });
    await client.todo.create({ title: 'Walk dog' });

    const { result } = renderHook(() => useList(client.todo), { wrapper });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.items).toHaveLength(2);
    expect(result.current.meta).not.toBeNull();
    expect(result.current.error).toBeNull();
  });

  it('starts with loading true', () => {
    const { client, wrapper } = setup();
    const { result } = renderHook(() => useList(client.todo), { wrapper });
    expect(result.current.loading).toBe(true);
  });

  it('handles errors', async () => {
    const { client, wrapper } = setup();

    // Spy on list to make it throw
    vi.spyOn(client.todo, 'list').mockRejectedValueOnce(new Error('Network error'));

    const { result } = renderHook(() => useList(client.todo), { wrapper });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.error?.message).toBe('Network error');
    expect(result.current.items).toHaveLength(0);
  });

  it('refetches when query changes', async () => {
    const { client, wrapper } = setup();
    await client.todo.create({ title: 'Alpha' });
    await client.todo.create({ title: 'Beta' });

    let query = {};
    const { result, rerender } = renderHook(
      () => useList(client.todo, query),
      { wrapper },
    );

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    expect(result.current.items).toHaveLength(2);

    // Change query to filter
    query = { filter: { title: 'Alpha' } };
    rerender();

    await waitFor(() => {
      expect(result.current.items).toHaveLength(1);
    });
  });

  it('respects enabled option', async () => {
    const { client, wrapper } = setup();
    await client.todo.create({ title: 'Test' });

    const { result } = renderHook(
      () => useList(client.todo, {}, { enabled: false }),
      { wrapper },
    );

    // Should not fetch when disabled
    await waitFor(() => {
      expect(result.current.loading).toBe(true);
    });
    expect(result.current.items).toHaveLength(0);
  });

  it('supports manual refetch', async () => {
    const { client, wrapper } = setup();

    const { result } = renderHook(() => useList(client.todo), { wrapper });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    expect(result.current.items).toHaveLength(0);

    // Add item externally then refetch
    await client.todo.create({ title: 'New' });

    await act(async () => {
      result.current.refetch();
    });

    await waitFor(() => {
      expect(result.current.items).toHaveLength(1);
    });
  });

  it('auto-invalidates when mutation triggers', async () => {
    const { client, wrapper } = setup();

    const { result } = renderHook(
      () => ({
        list: useList(client.todo),
        mutation: useMutation(client.todo),
      }),
      { wrapper },
    );

    await waitFor(() => {
      expect(result.current.list.loading).toBe(false);
    });
    expect(result.current.list.items).toHaveLength(0);

    // Create via mutation — should auto-invalidate list
    await act(async () => {
      await result.current.mutation.create({ title: 'Auto refresh' });
    });

    await waitFor(() => {
      expect(result.current.list.items).toHaveLength(1);
    });
  });
});
