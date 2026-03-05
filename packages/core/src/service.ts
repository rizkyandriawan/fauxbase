import type { ApiResponse, HookType, PagedResponse, QueryParams } from './types';
import type { Driver } from './drivers/types';
import type { Entity } from './entity';
import type { EventBus } from './events/event-bus';
import { registerHook, getHooks } from './registry';

// --- Hook decorators ---

export function beforeCreate(): MethodDecorator {
  return (target: Object, propertyKey: string | symbol) => {
    registerHook(target.constructor, 'beforeCreate', propertyKey as string);
  };
}

export function beforeUpdate(): MethodDecorator {
  return (target: Object, propertyKey: string | symbol) => {
    registerHook(target.constructor, 'beforeUpdate', propertyKey as string);
  };
}

export function afterCreate(): MethodDecorator {
  return (target: Object, propertyKey: string | symbol) => {
    registerHook(target.constructor, 'afterCreate', propertyKey as string);
  };
}

export function afterUpdate(): MethodDecorator {
  return (target: Object, propertyKey: string | symbol) => {
    registerHook(target.constructor, 'afterUpdate', propertyKey as string);
  };
}

// --- Service base class ---

export abstract class Service<T extends Entity> {
  abstract entity: new (...args: any[]) => T;
  abstract endpoint: string;

  protected driver!: Driver;
  protected resourceName!: string;
  protected client: any;

  /** @internal */
  _eventBus?: EventBus;

  /** @internal — called by createClient to wire the service */
  _init(driver: Driver, resourceName: string): void {
    this.driver = driver;
    this.resourceName = resourceName;
  }

  /** @internal — called by createClient to give services access to the client */
  _setClient(client: any): void {
    this.client = client;
  }

  async list(query: QueryParams = {}): Promise<PagedResponse<T>> {
    return this.driver.list<T>(this.resourceName, query);
  }

  async get(id: string): Promise<ApiResponse<T>> {
    return this.driver.get<T>(this.resourceName, id);
  }

  async create(data: Partial<T>): Promise<ApiResponse<T>> {
    const allItems = (await this.driver.list<T>(this.resourceName, {})).items;
    await this.runHooks('beforeCreate', data, allItems);
    const result = await this.driver.create<T>(this.resourceName, data);
    await this.runHooks('afterCreate', result.data);
    this.emitEvent('created', { data: result.data, id: (result.data as any).id });
    return result;
  }

  async update(id: string, data: Partial<T>): Promise<ApiResponse<T>> {
    await this.runHooks('beforeUpdate', id, data);
    const result = await this.driver.update<T>(this.resourceName, id, data);
    await this.runHooks('afterUpdate', result.data);
    this.emitEvent('updated', { data: result.data, id });
    return result;
  }

  async delete(id: string): Promise<ApiResponse<T>> {
    const result = await this.driver.delete<T>(this.resourceName, id);
    this.emitEvent('deleted', { data: result.data, id });
    return result;
  }

  async count(filter?: Record<string, any>): Promise<number> {
    return this.driver.count(this.resourceName, filter);
  }

  get bulk() {
    const self = this;
    return {
      async create(items: Array<Partial<T>>) {
        const result = await self.driver.bulkCreate<T>(self.resourceName, items);
        self.emitEvent('bulkCreated', { data: result.data });
        return result;
      },
      async update(updates: Array<{ id: string; data: Partial<T> }>) {
        const result = await self.driver.bulkUpdate<T>(self.resourceName, updates);
        self.emitEvent('bulkUpdated', { data: result.data, ids: updates.map(u => u.id) });
        return result;
      },
      async delete(ids: string[]) {
        const result = await self.driver.bulkDelete(self.resourceName, ids);
        self.emitEvent('bulkDeleted', { ids });
        return result;
      },
    };
  }

  private emitEvent(action: import('./events/types').EventAction, extra: { data?: any; id?: string; ids?: string[] }): void {
    if (!this._eventBus) return;
    this._eventBus.emit({
      action,
      resource: this.resourceName,
      data: extra.data,
      id: extra.id,
      ids: extra.ids,
      timestamp: Date.now(),
      source: 'local',
    });
  }

  private async runHooks(hookType: HookType, ...args: any[]): Promise<void> {
    const methods = getHooks(this.constructor, hookType);
    for (const methodName of methods) {
      await (this as any)[methodName](...args);
    }
  }
}
