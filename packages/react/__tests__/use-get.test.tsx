import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { createClient, Entity, field, Service } from 'fauxbase';
import { FauxbaseProvider } from '../src/context';
import { useGet } from '../src/use-get';

class Note extends Entity {
  @field({ required: true }) title!: string;
  @field({ default: '' }) body!: string;
}

class NoteService extends Service<Note> {
  entity = Note;
  endpoint = '/notes';
}

function setup() {
  const client = createClient({
    driver: { type: 'local', persist: 'memory' },
    services: { note: NoteService },
  });
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <FauxbaseProvider client={client}>{children}</FauxbaseProvider>
  );
  return { client, wrapper };
}

describe('useGet', () => {
  it('fetches a single record by id', async () => {
    const { client, wrapper } = setup();
    const { data: created } = await client.note.create({ title: 'Hello', body: 'World' });

    const { result } = renderHook(
      () => useGet(client.note, (created as any).id),
      { wrapper },
    );

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.data).not.toBeNull();
    expect((result.current.data as any).title).toBe('Hello');
    expect(result.current.error).toBeNull();
  });

  it('refetches when id changes', async () => {
    const { client, wrapper } = setup();
    const { data: a } = await client.note.create({ title: 'Note A' });
    const { data: b } = await client.note.create({ title: 'Note B' });

    let id = (a as any).id;
    const { result, rerender } = renderHook(
      () => useGet(client.note, id),
      { wrapper },
    );

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    expect((result.current.data as any).title).toBe('Note A');

    // Change id
    id = (b as any).id;
    rerender();

    await waitFor(() => {
      expect((result.current.data as any)?.title).toBe('Note B');
    });
  });

  it('handles null id gracefully', async () => {
    const { client, wrapper } = setup();

    const { result } = renderHook(
      () => useGet(client.note, null),
      { wrapper },
    );

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.data).toBeNull();
    expect(result.current.error).toBeNull();
  });

  it('handles not found error', async () => {
    const { client, wrapper } = setup();

    const { result } = renderHook(
      () => useGet(client.note, 'nonexistent-id'),
      { wrapper },
    );

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.error).not.toBeNull();
    expect(result.current.data).toBeNull();
  });
});
