import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderHook } from '@testing-library/react';
import { createClient, Entity, field, Service } from 'fauxbase';
import { FauxbaseProvider, useFauxbaseContext } from '../src/context';
import { useFauxbase } from '../src/use-fauxbase';

class Item extends Entity {
  @field({ required: true }) name!: string;
}

class ItemService extends Service<Item> {
  entity = Item;
  endpoint = '/items';
}

function createApp() {
  return createClient({
    driver: { type: 'local', persist: 'memory' },
    services: { item: ItemService },
  });
}

describe('FauxbaseProvider', () => {
  it('provides context to children', () => {
    const client = createApp();
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <FauxbaseProvider client={client}>{children}</FauxbaseProvider>
    );

    const { result } = renderHook(() => useFauxbaseContext(), { wrapper });
    expect(result.current.client).toBe(client);
    expect(typeof result.current.invalidate).toBe('function');
    expect(typeof result.current.subscribe).toBe('function');
  });

  it('throws when used outside provider', () => {
    expect(() => {
      renderHook(() => useFauxbaseContext());
    }).toThrow('useFauxbaseContext must be used within a FauxbaseProvider');
  });
});

describe('useFauxbase', () => {
  it('returns the client from context', () => {
    const client = createApp();
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <FauxbaseProvider client={client}>{children}</FauxbaseProvider>
    );

    const { result } = renderHook(() => useFauxbase(), { wrapper });
    expect(result.current).toBe(client);
    expect(result.current.item).toBeInstanceOf(ItemService);
  });
});
