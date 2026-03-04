import type { ApiResponse, HookType, PagedResponse, QueryParams } from './types';
import type { Driver } from './drivers/types';
import type { Entity } from './entity';
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
    return result;
  }

  async update(id: string, data: Partial<T>): Promise<ApiResponse<T>> {
    await this.runHooks('beforeUpdate', id, data);
    const result = await this.driver.update<T>(this.resourceName, id, data);
    await this.runHooks('afterUpdate', result.data);
    return result;
  }

  async delete(id: string): Promise<ApiResponse<T>> {
    return this.driver.delete<T>(this.resourceName, id);
  }

  async count(filter?: Record<string, any>): Promise<number> {
    return this.driver.count(this.resourceName, filter);
  }

  get bulk() {
    return {
      create: (items: Array<Partial<T>>) =>
        this.driver.bulkCreate<T>(this.resourceName, items),
      update: (updates: Array<{ id: string; data: Partial<T> }>) =>
        this.driver.bulkUpdate<T>(this.resourceName, updates),
      delete: (ids: string[]) =>
        this.driver.bulkDelete(this.resourceName, ids),
    };
  }

  private async runHooks(hookType: HookType, ...args: any[]): Promise<void> {
    const methods = getHooks(this.constructor, hookType);
    for (const methodName of methods) {
      await (this as any)[methodName](...args);
    }
  }
}
