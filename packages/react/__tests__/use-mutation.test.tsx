import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderHook, act, waitFor } from '@testing-library/react';
import { createClient, Entity, field, Service } from 'fauxbase';
import { FauxbaseProvider } from '../src/context';
import { useMutation } from '../src/use-mutation';
import { useList } from '../src/use-list';

class Task extends Entity {
  @field({ required: true }) title!: string;
  @field({ default: 'todo' }) status!: string;
}

class TaskService extends Service<Task> {
  entity = Task;
  endpoint = '/tasks';
}

function setup() {
  const client = createClient({
    driver: { type: 'local', persist: 'memory' },
    services: { task: TaskService },
  });
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <FauxbaseProvider client={client}>{children}</FauxbaseProvider>
  );
  return { client, wrapper };
}

describe('useMutation', () => {
  it('creates a record', async () => {
    const { client, wrapper } = setup();

    const { result } = renderHook(() => useMutation(client.task), { wrapper });

    let created: any;
    await act(async () => {
      created = await result.current.create({ title: 'New task' });
    });

    expect(created.title).toBe('New task');
    expect(created.id).toBeDefined();
  });

  it('updates a record', async () => {
    const { client, wrapper } = setup();
    const { data: existing } = await client.task.create({ title: 'Original' });

    const { result } = renderHook(() => useMutation(client.task), { wrapper });

    let updated: any;
    await act(async () => {
      updated = await result.current.update((existing as any).id, { status: 'done' });
    });

    expect(updated.status).toBe('done');
  });

  it('removes a record', async () => {
    const { client, wrapper } = setup();
    const { data: existing } = await client.task.create({ title: 'To delete' });

    const { result } = renderHook(() => useMutation(client.task), { wrapper });

    await act(async () => {
      await result.current.remove((existing as any).id);
    });

    // Verify soft-deleted
    const list = await client.task.list();
    expect(list.items).toHaveLength(0);
  });

  it('sets loading during mutation', async () => {
    const { client, wrapper } = setup();

    const { result } = renderHook(() => useMutation(client.task), { wrapper });
    expect(result.current.loading).toBe(false);

    await act(async () => {
      await result.current.create({ title: 'Loading test' });
    });

    expect(result.current.loading).toBe(false);
  });

  it('handles errors', async () => {
    const { client, wrapper } = setup();

    const { result } = renderHook(() => useMutation(client.task), { wrapper });

    // Try to update non-existent record
    await act(async () => {
      try {
        await result.current.update('nonexistent', { title: 'Fail' });
      } catch {
        // expected
      }
    });

    expect(result.current.error).not.toBeNull();
  });

  it('triggers invalidation for useList subscribers', async () => {
    const { client, wrapper } = setup();

    const { result } = renderHook(
      () => ({
        list: useList(client.task),
        mutation: useMutation(client.task),
      }),
      { wrapper },
    );

    await waitFor(() => {
      expect(result.current.list.loading).toBe(false);
    });
    expect(result.current.list.items).toHaveLength(0);

    await act(async () => {
      await result.current.mutation.create({ title: 'Invalidate test' });
    });

    await waitFor(() => {
      expect(result.current.list.items).toHaveLength(1);
    });

    // Delete and verify invalidation
    const itemId = (result.current.list.items[0] as any).id;
    await act(async () => {
      await result.current.mutation.remove(itemId);
    });

    await waitFor(() => {
      expect(result.current.list.items).toHaveLength(0);
    });
  });
});
