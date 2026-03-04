import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { render, fireEvent, screen, act } from '@testing-library/react';
import { FauxbaseDevtools } from '../src/devtools';
import { createRequestLogger } from '../src/request-logger';

// Mock client
function createMockClient() {
  return {
    product: {
      list: vi.fn().mockResolvedValue({ items: [{ id: '1', name: 'Foo' }], meta: {} }),
      get: vi.fn().mockResolvedValue({ data: { id: '1', name: 'Foo' } }),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    auth: {
      isLoggedIn: false,
      currentUser: null,
      token: null,
      logout: vi.fn(),
    },
  };
}

describe('FauxbaseDevtools', () => {
  it('renders toggle button when closed', () => {
    const client = createMockClient();
    render(<FauxbaseDevtools client={client} />);
    expect(screen.getByTestId('devtools-toggle')).toBeTruthy();
  });

  it('opens panel when toggle clicked', () => {
    const client = createMockClient();
    render(<FauxbaseDevtools client={client} />);
    fireEvent.click(screen.getByTestId('devtools-toggle'));
    expect(screen.getByTestId('tab-data')).toBeTruthy();
    expect(screen.getByTestId('tab-auth')).toBeTruthy();
    expect(screen.getByTestId('tab-requests')).toBeTruthy();
    expect(screen.getByTestId('tab-seeds')).toBeTruthy();
  });

  it('renders open by default with config', () => {
    const client = createMockClient();
    render(<FauxbaseDevtools client={client} config={{ defaultOpen: true }} />);
    expect(screen.getByTestId('tab-data')).toBeTruthy();
  });

  it('closes panel when close button clicked', () => {
    const client = createMockClient();
    render(<FauxbaseDevtools client={client} config={{ defaultOpen: true }} />);
    fireEvent.click(screen.getByTestId('devtools-close'));
    expect(screen.getByTestId('devtools-toggle')).toBeTruthy();
    expect(screen.queryByTestId('tab-data')).toBeNull();
  });

  it('switches tabs', () => {
    const client = createMockClient();
    render(<FauxbaseDevtools client={client} config={{ defaultOpen: true }} />);

    fireEvent.click(screen.getByTestId('tab-auth'));
    // Auth panel should show when no auth is active
    expect(screen.getByText('Logged Out')).toBeTruthy();
  });
});

describe('createRequestLogger', () => {
  it('wraps service methods and logs calls', async () => {
    const logger = createRequestLogger();
    const service = {
      list: vi.fn().mockResolvedValue({ items: [], meta: {} }),
      _init: vi.fn(),
    };

    const wrapped = logger.wrapService(service, 'product');
    await wrapped.list({ page: 1 });

    const entries = logger.getEntries();
    expect(entries).toHaveLength(1);
    expect(entries[0].service).toBe('product');
    expect(entries[0].method).toBe('list');
    expect(entries[0].duration).toBeGreaterThanOrEqual(0);
    expect(entries[0].error).toBeUndefined();
  });

  it('logs errors', async () => {
    const logger = createRequestLogger();
    const service = {
      get: vi.fn().mockRejectedValue(new Error('Not found')),
    };

    const wrapped = logger.wrapService(service, 'product');
    await expect(wrapped.get('1')).rejects.toThrow('Not found');

    const entries = logger.getEntries();
    expect(entries).toHaveLength(1);
    expect(entries[0].error).toBe('Not found');
  });

  it('skips internal methods (starting with _)', async () => {
    const logger = createRequestLogger();
    const service = {
      _init: vi.fn(),
      list: vi.fn().mockResolvedValue({ items: [] }),
    };

    const wrapped = logger.wrapService(service, 'test');
    wrapped._init();

    // _init should be called directly, not logged
    expect(service._init).toHaveBeenCalled();
    expect(logger.getEntries()).toHaveLength(0);
  });

  it('respects maxEntries', async () => {
    const logger = createRequestLogger(2);
    const service = { list: vi.fn().mockResolvedValue({}) };
    const wrapped = logger.wrapService(service, 'test');

    await wrapped.list();
    await wrapped.list();
    await wrapped.list();

    expect(logger.getEntries()).toHaveLength(2);
  });

  it('clears entries', async () => {
    const logger = createRequestLogger();
    const service = { list: vi.fn().mockResolvedValue({}) };
    const wrapped = logger.wrapService(service, 'test');

    await wrapped.list();
    expect(logger.getEntries()).toHaveLength(1);

    logger.clear();
    expect(logger.getEntries()).toHaveLength(0);
  });

  it('notifies subscribers', async () => {
    const logger = createRequestLogger();
    const listener = vi.fn();
    logger.subscribe(listener);

    const service = { list: vi.fn().mockResolvedValue({}) };
    const wrapped = logger.wrapService(service, 'test');
    await wrapped.list();

    expect(listener).toHaveBeenCalled();
  });
});
