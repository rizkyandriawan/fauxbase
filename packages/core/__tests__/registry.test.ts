import { describe, it, expect } from 'vitest';
import {
  registerField, registerRelation, registerComputed, registerHook,
  getFieldMeta, getRelationMeta, getComputedMeta, getHooks,
} from '../src/registry';

describe('Field registry', () => {
  it('registers and retrieves field metadata', () => {
    class TestEntity {}
    registerField(TestEntity, 'name', { required: true });
    registerField(TestEntity, 'price', { min: 0, max: 1000 });

    const meta = getFieldMeta(TestEntity);
    expect(meta.get('name')).toEqual({ required: true });
    expect(meta.get('price')).toEqual({ min: 0, max: 1000 });
  });

  it('isolates metadata between classes', () => {
    class A {}
    class B {}
    registerField(A, 'x', { required: true });
    registerField(B, 'y', { default: 5 });

    expect(getFieldMeta(A).has('x')).toBe(true);
    expect(getFieldMeta(A).has('y')).toBe(false);
    expect(getFieldMeta(B).has('y')).toBe(true);
    expect(getFieldMeta(B).has('x')).toBe(false);
  });

  it('returns empty map for unregistered class', () => {
    class Unknown {}
    expect(getFieldMeta(Unknown).size).toBe(0);
  });
});

describe('Relation registry', () => {
  it('registers and retrieves relation metadata', () => {
    class TestEntity {}
    registerRelation(TestEntity, 'categoryId', 'category');
    expect(getRelationMeta(TestEntity).get('categoryId')).toBe('category');
  });

  it('returns empty map for unregistered class', () => {
    class Unknown {}
    expect(getRelationMeta(Unknown).size).toBe(0);
  });
});

describe('Computed registry', () => {
  it('registers and retrieves computed functions', () => {
    class TestEntity {}
    const fn = (e: any) => e.stock > 0;
    registerComputed(TestEntity, 'available', fn);
    expect(getComputedMeta(TestEntity).get('available')).toBe(fn);
  });

  it('returns empty map for unregistered class', () => {
    class Unknown {}
    expect(getComputedMeta(Unknown).size).toBe(0);
  });
});

describe('Hook registry', () => {
  it('registers and retrieves hooks', () => {
    class TestService {}
    registerHook(TestService, 'beforeCreate', 'validateName');
    registerHook(TestService, 'beforeCreate', 'setDefaults');
    registerHook(TestService, 'afterCreate', 'notify');

    expect(getHooks(TestService, 'beforeCreate')).toEqual(['validateName', 'setDefaults']);
    expect(getHooks(TestService, 'afterCreate')).toEqual(['notify']);
    expect(getHooks(TestService, 'beforeUpdate')).toEqual([]);
  });

  it('returns empty array for unregistered class', () => {
    class Unknown {}
    expect(getHooks(Unknown, 'beforeCreate')).toEqual([]);
  });
});
