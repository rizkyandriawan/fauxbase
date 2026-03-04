import { describe, it, expect } from 'vitest';
import { laravelPreset } from '../../src/presets/laravel';

describe('laravelPreset', () => {
  describe('response.list', () => {
    it('parses Laravel paginated response', () => {
      const raw = {
        data: [{ id: '1', name: 'Foo' }],
        meta: {
          current_page: 2,
          per_page: 15,
          total: 30,
          last_page: 2,
        },
      };

      const result = laravelPreset.response.list(raw);
      expect(result.items).toHaveLength(1);
      expect(result.meta.page).toBe(2);
      expect(result.meta.size).toBe(15);
      expect(result.meta.totalItems).toBe(30);
      expect(result.meta.totalPages).toBe(2);
    });

    it('handles flat paginated response (without meta wrapper)', () => {
      const raw = {
        data: [{ id: '1' }],
        current_page: 1,
        per_page: 10,
        total: 1,
        last_page: 1,
      };

      const result = laravelPreset.response.list(raw);
      expect(result.items).toHaveLength(1);
      expect(result.meta.page).toBe(1);
    });
  });

  describe('response.error', () => {
    it('parses Laravel validation errors', () => {
      const raw = {
        message: 'The given data was invalid.',
        errors: {
          email: ['The email field is required.'],
          name: ['The name field is required.'],
        },
      };

      const result = laravelPreset.response.error(raw);
      expect(result.error).toBe('The given data was invalid.');
      expect(result.details?.email).toBe('The email field is required.');
      expect(result.details?.name).toBe('The name field is required.');
    });
  });

  describe('query config', () => {
    it('uses bracket filter style', () => {
      expect(laravelPreset.query.filterStyle).toBe('bracket');
    });

    it('uses per_page as size param', () => {
      expect(laravelPreset.query.sizeParam).toBe('per_page');
    });
  });
});
