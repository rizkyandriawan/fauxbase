import { describe, it, expect } from 'vitest';
import { springBootPreset } from '../../src/presets/spring-boot';

describe('springBootPreset', () => {
  describe('response.list', () => {
    it('parses Spring Boot page response', () => {
      const raw = {
        content: [{ id: '1', name: 'Foo' }, { id: '2', name: 'Bar' }],
        pageable: { pageNumber: 0, pageSize: 20 },
        totalElements: 2,
        totalPages: 1,
      };

      const result = springBootPreset.response.list(raw);
      expect(result.items).toHaveLength(2);
      expect(result.meta.page).toBe(1); // 0-indexed + 1
      expect(result.meta.size).toBe(20);
      expect(result.meta.totalItems).toBe(2);
      expect(result.meta.totalPages).toBe(1);
    });
  });

  describe('response.single', () => {
    it('returns raw as data (Spring Boot returns entity directly)', () => {
      const result = springBootPreset.response.single({ id: '1', name: 'Foo' });
      expect(result.data).toEqual({ id: '1', name: 'Foo' });
    });
  });

  describe('query config', () => {
    it('uses dot filter style', () => {
      expect(springBootPreset.query.filterStyle).toBe('dot');
    });

    it('uses 0-indexed pages', () => {
      expect(springBootPreset.query.pageOffset).toBe(-1);
    });
  });
});
