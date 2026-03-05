import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SSESource } from '../../src/events/sse-source';
import { EventBus } from '../../src/events/event-bus';
import type { SSEConfig } from '../../src/events/types';

// Mock EventSource
class MockEventSource {
  static instances: MockEventSource[] = [];
  url: string;
  withCredentials?: boolean;
  listeners = new Map<string, ((e: any) => void)[]>();

  constructor(url: string, opts?: { withCredentials?: boolean }) {
    this.url = url;
    this.withCredentials = opts?.withCredentials;
    MockEventSource.instances.push(this);
  }

  addEventListener(type: string, handler: (e: any) => void) {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, []);
    }
    this.listeners.get(type)!.push(handler);
  }

  close = vi.fn();

  // Test helper: simulate a server event
  simulateEvent(type: string, data: any) {
    const handlers = this.listeners.get(type) || [];
    for (const h of handlers) {
      h({ data: JSON.stringify(data) });
    }
  }
}

describe('SSESource', () => {
  beforeEach(() => {
    MockEventSource.instances = [];
    (globalThis as any).EventSource = MockEventSource;
  });

  afterEach(() => {
    delete (globalThis as any).EventSource;
  });

  it('connects and listens to mapped event types', () => {
    const bus = new EventBus();
    const handler = vi.fn();
    bus.on('todo', handler);

    const config: SSEConfig = {
      type: 'sse',
      url: '/api/events',
      eventMap: { 'todo-changed': 'todo' },
    };

    const source = new SSESource(config, bus);
    source.connect();

    expect(MockEventSource.instances).toHaveLength(1);
    const es = MockEventSource.instances[0];
    expect(es.url).toBe('/api/events');

    es.simulateEvent('todo-changed', {
      action: 'created',
      data: { id: '1', title: 'Test' },
    });

    expect(handler).toHaveBeenCalledTimes(1);
    const event = handler.mock.calls[0][0];
    expect(event.resource).toBe('todo');
    expect(event.action).toBe('created');
    expect(event.source).toBe('remote');
    expect(event.data).toEqual({ id: '1', title: 'Test' });
  });

  it('passes withCredentials to EventSource', () => {
    const bus = new EventBus();
    const config: SSEConfig = {
      type: 'sse',
      url: '/api/events',
      eventMap: {},
      withCredentials: true,
    };

    const source = new SSESource(config, bus);
    source.connect();

    expect(MockEventSource.instances[0].withCredentials).toBe(true);
  });

  it('disconnect closes EventSource', () => {
    const bus = new EventBus();
    const config: SSEConfig = {
      type: 'sse',
      url: '/api/events',
      eventMap: {},
    };

    const source = new SSESource(config, bus);
    source.connect();
    source.disconnect();

    expect(MockEventSource.instances[0].close).toHaveBeenCalled();
  });

  it('handles invalid JSON gracefully', () => {
    const bus = new EventBus();
    const handler = vi.fn();
    bus.on('todo', handler);

    const config: SSEConfig = {
      type: 'sse',
      url: '/api/events',
      eventMap: { 'todo-changed': 'todo' },
    };

    const source = new SSESource(config, bus);
    source.connect();

    const es = MockEventSource.instances[0];
    // Simulate bad JSON by calling listener directly
    const listeners = es.listeners.get('todo-changed')!;
    listeners[0]({ data: 'not json' });

    expect(handler).not.toHaveBeenCalled();
  });

  it('maps multiple event types to different resources', () => {
    const bus = new EventBus();
    const todoHandler = vi.fn();
    const userHandler = vi.fn();
    bus.on('todo', todoHandler);
    bus.on('user', userHandler);

    const config: SSEConfig = {
      type: 'sse',
      url: '/api/events',
      eventMap: {
        'todo-changed': 'todo',
        'user-changed': 'user',
      },
    };

    const source = new SSESource(config, bus);
    source.connect();

    const es = MockEventSource.instances[0];
    es.simulateEvent('todo-changed', { action: 'updated', id: '1' });
    es.simulateEvent('user-changed', { action: 'deleted', id: '2' });

    expect(todoHandler).toHaveBeenCalledTimes(1);
    expect(userHandler).toHaveBeenCalledTimes(1);
  });
});
