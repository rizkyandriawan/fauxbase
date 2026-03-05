import { describe, it, expect, vi } from 'vitest';
import { EventBus } from '../../src/events/event-bus';
import type { FauxbaseEvent } from '../../src/events/types';

function makeEvent(resource: string, action: string = 'created'): FauxbaseEvent {
  return {
    action: action as any,
    resource,
    timestamp: Date.now(),
    source: 'local',
  };
}

describe('EventBus', () => {
  it('calls handler for matching resource', () => {
    const bus = new EventBus();
    const handler = vi.fn();

    bus.on('todo', handler);
    bus.emit(makeEvent('todo'));

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler.mock.calls[0][0].resource).toBe('todo');
  });

  it('does not call handler for non-matching resource', () => {
    const bus = new EventBus();
    const handler = vi.fn();

    bus.on('todo', handler);
    bus.emit(makeEvent('user'));

    expect(handler).not.toHaveBeenCalled();
  });

  it('onAny receives all events', () => {
    const bus = new EventBus();
    const handler = vi.fn();

    bus.onAny(handler);
    bus.emit(makeEvent('todo'));
    bus.emit(makeEvent('user'));

    expect(handler).toHaveBeenCalledTimes(2);
  });

  it('unsubscribes via returned function', () => {
    const bus = new EventBus();
    const handler = vi.fn();

    const unsub = bus.on('todo', handler);
    bus.emit(makeEvent('todo'));
    expect(handler).toHaveBeenCalledTimes(1);

    unsub();
    bus.emit(makeEvent('todo'));
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('unsubscribes onAny via returned function', () => {
    const bus = new EventBus();
    const handler = vi.fn();

    const unsub = bus.onAny(handler);
    bus.emit(makeEvent('todo'));
    expect(handler).toHaveBeenCalledTimes(1);

    unsub();
    bus.emit(makeEvent('todo'));
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('supports multiple handlers for same resource', () => {
    const bus = new EventBus();
    const h1 = vi.fn();
    const h2 = vi.fn();

    bus.on('todo', h1);
    bus.on('todo', h2);
    bus.emit(makeEvent('todo'));

    expect(h1).toHaveBeenCalledTimes(1);
    expect(h2).toHaveBeenCalledTimes(1);
  });

  it('destroy clears all listeners', () => {
    const bus = new EventBus();
    const h1 = vi.fn();
    const h2 = vi.fn();

    bus.on('todo', h1);
    bus.onAny(h2);
    bus.destroy();
    bus.emit(makeEvent('todo'));

    expect(h1).not.toHaveBeenCalled();
    expect(h2).not.toHaveBeenCalled();
  });

  it('emits both resource and onAny handlers', () => {
    const bus = new EventBus();
    const specific = vi.fn();
    const any = vi.fn();

    bus.on('todo', specific);
    bus.onAny(any);
    bus.emit(makeEvent('todo'));

    expect(specific).toHaveBeenCalledTimes(1);
    expect(any).toHaveBeenCalledTimes(1);
  });
});
