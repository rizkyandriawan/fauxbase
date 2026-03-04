import { describe, it, expect } from 'vitest';
import { Entity, field, relation, computed, applyDefaults, validateEntity, applyComputedFields } from '../src/entity';
import { ValidationError } from '../src/errors';
import { getFieldMeta, getRelationMeta, getComputedMeta } from '../src/registry';

class Product extends Entity {
  @field({ required: true })          name!: string;
  @field({ required: true, min: 0 })  price!: number;
  @field({ default: 0 })              stock!: number;
  @field({ default: true })           isActive!: boolean;
  @field({ max: 5 })                  rating!: number;

  @relation('category')               categoryId!: string;

  @computed((p: any) => p.stock > 0 && p.isActive)
  available!: boolean;
}

describe('@field decorator', () => {
  it('stores metadata for all fields', () => {
    const meta = getFieldMeta(Product);
    expect(meta.get('name')).toEqual({ required: true });
    expect(meta.get('price')).toEqual({ required: true, min: 0 });
    expect(meta.get('stock')).toEqual({ default: 0 });
    expect(meta.get('isActive')).toEqual({ default: true });
    expect(meta.get('rating')).toEqual({ max: 5 });
  });
});

describe('@relation decorator', () => {
  it('stores target entity name', () => {
    const meta = getRelationMeta(Product);
    expect(meta.get('categoryId')).toBe('category');
  });
});

describe('@computed decorator', () => {
  it('stores compute function', () => {
    const meta = getComputedMeta(Product);
    expect(meta.has('available')).toBe(true);
    const fn = meta.get('available')!;
    expect(fn({ stock: 5, isActive: true })).toBe(true);
    expect(fn({ stock: 0, isActive: true })).toBe(false);
  });
});

describe('applyDefaults', () => {
  it('applies defaults for missing fields', () => {
    const data = { name: 'Test', price: 100 };
    const result = applyDefaults(data, Product);
    expect(result.stock).toBe(0);
    expect(result.isActive).toBe(true);
    expect(result.name).toBe('Test');
  });

  it('does not overwrite existing values', () => {
    const data = { name: 'Test', price: 100, stock: 50, isActive: false };
    const result = applyDefaults(data, Product);
    expect(result.stock).toBe(50);
    expect(result.isActive).toBe(false);
  });
});

describe('validateEntity', () => {
  it('throws ValidationError for missing required fields on create', () => {
    expect(() => validateEntity({}, Product, true)).toThrow(ValidationError);
    try {
      validateEntity({}, Product, true);
    } catch (e: any) {
      expect(e.details).toHaveProperty('name');
      expect(e.details).toHaveProperty('price');
    }
  });

  it('passes for valid data on create', () => {
    expect(() => validateEntity({ name: 'Test', price: 100 }, Product, true)).not.toThrow();
  });

  it('skips required check on update', () => {
    expect(() => validateEntity({}, Product, false)).not.toThrow();
  });

  it('throws for min violation', () => {
    expect(() => validateEntity({ name: 'Test', price: -1 }, Product, true)).toThrow(ValidationError);
  });

  it('throws for max violation', () => {
    expect(() => validateEntity({ rating: 6 }, Product, false)).toThrow(ValidationError);
  });

  it('passes when value is within bounds', () => {
    expect(() => validateEntity({ price: 0, rating: 5 }, Product, false)).not.toThrow();
  });
});

describe('applyComputedFields', () => {
  it('adds computed getter to plain object', () => {
    const data = { stock: 10, isActive: true };
    const result = applyComputedFields<any>(data, Product);
    expect(result.available).toBe(true);
  });

  it('computed value updates reactively', () => {
    const data = { stock: 10, isActive: true };
    const result = applyComputedFields<any>(data, Product);
    expect(result.available).toBe(true);
    result.stock = 0;
    expect(result.available).toBe(false);
  });

  it('returns data as-is if no computed fields', () => {
    class Simple extends Entity {
      @field() name!: string;
    }
    const data = { name: 'test' };
    const result = applyComputedFields<any>(data, Simple);
    expect(result.name).toBe('test');
  });
});
