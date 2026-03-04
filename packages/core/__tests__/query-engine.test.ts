import { describe, it, expect } from 'vitest';
import { parseFilterKey, matchOperator, applyFilters, applySort, applyPagination, executeQuery } from '../src/query-engine';

describe('parseFilterKey', () => {
  it('parses operator suffix', () => {
    expect(parseFilterKey('price__gte')).toEqual({ field: 'price', operator: 'gte' });
    expect(parseFilterKey('name__contains')).toEqual({ field: 'name', operator: 'contains' });
    expect(parseFilterKey('stock__between')).toEqual({ field: 'stock', operator: 'between' });
    expect(parseFilterKey('status__in')).toEqual({ field: 'status', operator: 'in' });
    expect(parseFilterKey('desc__isnull')).toEqual({ field: 'desc', operator: 'isnull' });
  });

  it('defaults to eq when no operator', () => {
    expect(parseFilterKey('isActive')).toEqual({ field: 'isActive', operator: 'eq' });
  });

  it('handles all 13 operators', () => {
    const ops = ['eq', 'ne', 'gt', 'gte', 'lt', 'lte', 'like', 'contains', 'startswith', 'endswith', 'between', 'in', 'isnull'];
    for (const op of ops) {
      expect(parseFilterKey(`field__${op}`).operator).toBe(op);
    }
  });
});

describe('matchOperator', () => {
  // eq
  it('eq: exact match', () => {
    expect(matchOperator('hello', 'eq', 'hello')).toBe(true);
    expect(matchOperator('hello', 'eq', 'world')).toBe(false);
    expect(matchOperator(42, 'eq', 42)).toBe(true);
    expect(matchOperator(true, 'eq', true)).toBe(true);
  });

  // ne
  it('ne: not equal', () => {
    expect(matchOperator('a', 'ne', 'b')).toBe(true);
    expect(matchOperator('a', 'ne', 'a')).toBe(false);
  });

  // gt, gte
  it('gt: greater than', () => {
    expect(matchOperator(10, 'gt', 5)).toBe(true);
    expect(matchOperator(5, 'gt', 5)).toBe(false);
    expect(matchOperator(3, 'gt', 5)).toBe(false);
  });

  it('gte: greater than or equal', () => {
    expect(matchOperator(5, 'gte', 5)).toBe(true);
    expect(matchOperator(6, 'gte', 5)).toBe(true);
    expect(matchOperator(4, 'gte', 5)).toBe(false);
  });

  // lt, lte
  it('lt: less than', () => {
    expect(matchOperator(3, 'lt', 5)).toBe(true);
    expect(matchOperator(5, 'lt', 5)).toBe(false);
  });

  it('lte: less than or equal', () => {
    expect(matchOperator(5, 'lte', 5)).toBe(true);
    expect(matchOperator(4, 'lte', 5)).toBe(true);
    expect(matchOperator(6, 'lte', 5)).toBe(false);
  });

  // like / contains
  it('contains: case-insensitive substring', () => {
    expect(matchOperator('Hello World', 'contains', 'world')).toBe(true);
    expect(matchOperator('Hello World', 'contains', 'xyz')).toBe(false);
  });

  it('like: same as contains', () => {
    expect(matchOperator('FooBar', 'like', 'oob')).toBe(true);
  });

  // startswith
  it('startswith: case-insensitive prefix', () => {
    expect(matchOperator('Hello', 'startswith', 'hel')).toBe(true);
    expect(matchOperator('Hello', 'startswith', 'world')).toBe(false);
  });

  // endswith
  it('endswith: case-insensitive suffix', () => {
    expect(matchOperator('Hello', 'endswith', 'LLO')).toBe(true);
    expect(matchOperator('Hello', 'endswith', 'xyz')).toBe(false);
  });

  // between
  it('between: inclusive range', () => {
    expect(matchOperator(50, 'between', [10, 100])).toBe(true);
    expect(matchOperator(10, 'between', [10, 100])).toBe(true);
    expect(matchOperator(100, 'between', [10, 100])).toBe(true);
    expect(matchOperator(5, 'between', [10, 100])).toBe(false);
    expect(matchOperator(101, 'between', [10, 100])).toBe(false);
  });

  // in
  it('in: value in list', () => {
    expect(matchOperator('a', 'in', ['a', 'b', 'c'])).toBe(true);
    expect(matchOperator('d', 'in', ['a', 'b', 'c'])).toBe(false);
  });

  // isnull
  it('isnull: null/undefined check', () => {
    expect(matchOperator(null, 'isnull', true)).toBe(true);
    expect(matchOperator(undefined, 'isnull', true)).toBe(true);
    expect(matchOperator('value', 'isnull', true)).toBe(false);
    expect(matchOperator('value', 'isnull', false)).toBe(true);
    expect(matchOperator(null, 'isnull', false)).toBe(false);
  });

  // null/undefined handling for non-isnull operators
  it('returns false for null values on non-isnull operators', () => {
    expect(matchOperator(null, 'eq', 'hello')).toBe(false);
    expect(matchOperator(undefined, 'gt', 5)).toBe(false);
    expect(matchOperator(null, 'contains', 'x')).toBe(false);
  });
});

describe('applyFilters', () => {
  const items = [
    { name: 'Hair Clay', price: 185000, stock: 50, category: 'hair' },
    { name: 'Beard Oil', price: 125000, stock: 30, category: 'beard' },
    { name: 'Hair Spray', price: 95000, stock: 0, category: 'hair' },
    { name: 'Pomade', price: 150000, stock: 20, category: 'hair' },
  ];

  it('filters with single operator', () => {
    const result = applyFilters(items, { price__gte: 150000 });
    expect(result).toHaveLength(2);
    expect(result.map(i => i.name)).toEqual(['Hair Clay', 'Pomade']);
  });

  it('filters with multiple operators (AND)', () => {
    const result = applyFilters(items, { category: 'hair', price__lt: 150000 });
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('Hair Spray');
  });

  it('filters with contains', () => {
    const result = applyFilters(items, { name__contains: 'hair' });
    expect(result).toHaveLength(2);
  });

  it('filters with in', () => {
    const result = applyFilters(items, { category__in: ['beard'] });
    expect(result).toHaveLength(1);
  });

  it('filters with between', () => {
    const result = applyFilters(items, { price__between: [100000, 160000] });
    expect(result).toHaveLength(2);
  });

  it('returns all items with empty filter', () => {
    const result = applyFilters(items, {});
    expect(result).toHaveLength(4);
  });
});

describe('applySort', () => {
  const items = [
    { name: 'B', price: 200 },
    { name: 'A', price: 100 },
    { name: 'C', price: 300 },
  ];

  it('sorts ascending', () => {
    const result = applySort(items, { field: 'name', direction: 'asc' });
    expect(result.map(i => i.name)).toEqual(['A', 'B', 'C']);
  });

  it('sorts descending', () => {
    const result = applySort(items, { field: 'price', direction: 'desc' });
    expect(result.map(i => i.price)).toEqual([300, 200, 100]);
  });

  it('returns original order without sort', () => {
    const result = applySort(items);
    expect(result.map(i => i.name)).toEqual(['B', 'A', 'C']);
  });

  it('handles null values (pushed to end)', () => {
    const withNull = [...items, { name: null as any, price: 50 }];
    const result = applySort(withNull, { field: 'name', direction: 'asc' });
    expect(result[result.length - 1].price).toBe(50);
  });

  it('does not mutate original array', () => {
    const original = [...items];
    applySort(items, { field: 'name', direction: 'asc' });
    expect(items).toEqual(original);
  });
});

describe('applyPagination', () => {
  const items = Array.from({ length: 50 }, (_, i) => ({ id: i }));

  it('returns correct page', () => {
    const result = applyPagination(items, 1, 10);
    expect(result.items).toHaveLength(10);
    expect(result.items[0].id).toBe(0);
    expect(result.meta).toEqual({ page: 1, size: 10, totalItems: 50, totalPages: 5 });
  });

  it('returns correct second page', () => {
    const result = applyPagination(items, 2, 10);
    expect(result.items[0].id).toBe(10);
  });

  it('returns partial last page', () => {
    const result = applyPagination(items, 3, 20);
    expect(result.items).toHaveLength(10);
    expect(result.meta.totalPages).toBe(3);
  });

  it('returns empty for page beyond total', () => {
    const result = applyPagination(items, 100, 10);
    expect(result.items).toHaveLength(0);
    expect(result.meta.totalItems).toBe(50);
  });

  it('defaults to page 1 size 20', () => {
    const result = applyPagination(items);
    expect(result.meta.page).toBe(1);
    expect(result.meta.size).toBe(20);
    expect(result.items).toHaveLength(20);
  });
});

describe('executeQuery', () => {
  const items = [
    { id: '1', name: 'A', price: 100, deletedAt: null },
    { id: '2', name: 'B', price: 200, deletedAt: null },
    { id: '3', name: 'C', price: 300, deletedAt: '2024-01-01' },
    { id: '4', name: 'D', price: 400, deletedAt: null },
  ];

  it('excludes soft-deleted records', () => {
    const result = executeQuery(items, {});
    expect(result.items).toHaveLength(3);
    expect(result.items.find(i => i.id === '3')).toBeUndefined();
  });

  it('applies filter, sort, and pagination together', () => {
    const result = executeQuery(items, {
      filter: { price__gte: 200 },
      sort: { field: 'price', direction: 'desc' },
      page: 1,
      size: 10,
    });
    expect(result.items).toHaveLength(2);
    expect(result.items[0].name).toBe('D');
    expect(result.items[1].name).toBe('B');
  });

  it('returns correct meta', () => {
    const result = executeQuery(items, { page: 1, size: 2 });
    expect(result.meta).toEqual({ page: 1, size: 2, totalItems: 3, totalPages: 2 });
  });
});
