import type { FieldOptions } from './types';
import { ValidationError } from './errors';
import { registerField, registerRelation, registerComputed, getFieldMeta, getComputedMeta } from './registry';

// --- Entity base class (schema definition, not instantiated for data) ---

export abstract class Entity {
  declare id: string;
  declare createdAt: string;
  declare updatedAt: string;
  declare createdById?: string;
  declare createdByName?: string;
  declare updatedById?: string;
  declare updatedByName?: string;
  declare deletedAt?: string | null;
  declare deletedById?: string;
  declare deletedByName?: string;
  declare version: number;
}

// --- Decorators ---

export function field(options: FieldOptions = {}): PropertyDecorator {
  return (target: Object, propertyKey: string | symbol) => {
    registerField(target.constructor, propertyKey as string, options);
  };
}

export function relation(entityName: string): PropertyDecorator {
  return (target: Object, propertyKey: string | symbol) => {
    registerRelation(target.constructor, propertyKey as string, entityName);
  };
}

export function computed(fn: (entity: any) => any): PropertyDecorator {
  return (target: Object, propertyKey: string | symbol) => {
    registerComputed(target.constructor, propertyKey as string, fn);
  };
}

// --- Utility functions ---

export function applyDefaults(data: Record<string, any>, entityClass: Function): Record<string, any> {
  const fieldMeta = getFieldMeta(entityClass);
  const result = { ...data };

  for (const [fieldName, options] of fieldMeta) {
    if (result[fieldName] === undefined && options.default !== undefined) {
      result[fieldName] = typeof options.default === 'function' ? options.default() : options.default;
    }
  }

  return result;
}

export function validateEntity(data: Record<string, any>, entityClass: Function, isCreate: boolean): void {
  const fieldMeta = getFieldMeta(entityClass);
  const errors: Record<string, string> = {};

  for (const [fieldName, options] of fieldMeta) {
    const value = data[fieldName];

    if (isCreate && options.required && (value === undefined || value === null || value === '')) {
      errors[fieldName] = `${fieldName} is required`;
    }

    if (value !== undefined && value !== null) {
      if (options.min !== undefined && typeof value === 'number' && value < options.min) {
        errors[fieldName] = `${fieldName} must be >= ${options.min}`;
      }
      if (options.max !== undefined && typeof value === 'number' && value > options.max) {
        errors[fieldName] = `${fieldName} must be <= ${options.max}`;
      }
    }
  }

  if (Object.keys(errors).length > 0) {
    throw new ValidationError('Validation failed', errors);
  }
}

export function applyComputedFields<T>(data: Record<string, any>, entityClass: Function): T {
  const computedMeta = getComputedMeta(entityClass);
  if (computedMeta.size === 0) return data as T;

  const result = { ...data };
  for (const [key, fn] of computedMeta) {
    Object.defineProperty(result, key, {
      get: () => fn(result),
      enumerable: true,
      configurable: true,
    });
  }
  return result as T;
}
