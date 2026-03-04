import { describe, it, expect } from 'vitest';
import { serializeQuery } from '../../src/drivers/query-serializer';
import { defaultPreset } from '../../src/presets/default';
import { springBootPreset } from '../../src/presets/spring-boot';
import { laravelPreset } from '../../src/presets/laravel';
import { nestjsPreset } from '../../src/presets/nestjs';

describe('serializeQuery', () => {
  describe('django filter style (default)', () => {
    const config = defaultPreset.query;

    it('passes through django-style filters', () => {
      const params = serializeQuery({ filter: { price__gte: 100, name: 'foo' } }, config);
      expect(params.get('price__gte')).toBe('100');
      expect(params.get('name')).toBe('foo');
    });

    it('serializes sort as field,direction', () => {
      const params = serializeQuery({ sort: { field: 'price', direction: 'desc' } }, config);
      expect(params.get('sort')).toBe('price,desc');
    });

    it('serializes page and size', () => {
      const params = serializeQuery({ page: 2, size: 10 }, config);
      expect(params.get('page')).toBe('2');
      expect(params.get('size')).toBe('10');
    });

    it('returns empty params for empty query', () => {
      const params = serializeQuery({}, config);
      expect(params.toString()).toBe('');
    });

    it('skips undefined filter values', () => {
      const params = serializeQuery({ filter: { a: 'yes', b: undefined } }, config);
      expect(params.get('a')).toBe('yes');
      expect(params.has('b')).toBe(false);
    });
  });

  describe('dot filter style (Spring Boot)', () => {
    const config = springBootPreset.query;

    it('converts __ to .', () => {
      const params = serializeQuery({ filter: { price__gte: 100 } }, config);
      expect(params.get('price.gte')).toBe('100');
    });

    it('applies 0-indexed page offset', () => {
      const params = serializeQuery({ page: 1 }, config);
      expect(params.get('page')).toBe('0'); // 1 + (-1) = 0
    });

    it('page 2 becomes 1 (0-indexed)', () => {
      const params = serializeQuery({ page: 2 }, config);
      expect(params.get('page')).toBe('1');
    });
  });

  describe('bracket filter style (Laravel)', () => {
    const config = laravelPreset.query;

    it('wraps in filter[]', () => {
      const params = serializeQuery({ filter: { price__gte: 100 } }, config);
      expect(params.get('filter[price_gte]')).toBe('100');
    });

    it('uses per_page param name', () => {
      const params = serializeQuery({ size: 15 }, config);
      expect(params.get('per_page')).toBe('15');
    });
  });

  describe('nestjs filter style', () => {
    const config = nestjsPreset.query;

    it('uses nested dot with $ prefix', () => {
      const params = serializeQuery({ filter: { price__gte: 100 } }, config);
      expect(params.get('filter.price.$gte')).toBe('100');
    });

    it('handles plain filter without operator', () => {
      const params = serializeQuery({ filter: { name: 'foo' } }, config);
      expect(params.get('filter.name')).toBe('foo');
    });

    it('uses field:direction sort format', () => {
      const params = serializeQuery({ sort: { field: 'name', direction: 'asc' } }, config);
      expect(params.get('sort')).toBe('name:asc');
    });

    it('uses limit as size param', () => {
      const params = serializeQuery({ size: 25 }, config);
      expect(params.get('limit')).toBe('25');
    });
  });

  describe('django ordering (sort)', () => {
    it('uses -field for desc', () => {
      const config = { ...defaultPreset.query, sortParam: 'ordering' };
      const params = serializeQuery({ sort: { field: 'price', direction: 'desc' } }, config);
      expect(params.get('ordering')).toBe('-price');
    });

    it('uses field for asc', () => {
      const config = { ...defaultPreset.query, sortParam: 'ordering' };
      const params = serializeQuery({ sort: { field: 'name', direction: 'asc' } }, config);
      expect(params.get('ordering')).toBe('name');
    });
  });
});
