import { describe, it, expect } from 'vitest';
import { defaultPreset } from '../../src/presets/default';

describe('defaultPreset', () => {
  describe('response.single', () => {
    it('extracts data from { data } wrapper', () => {
      const result = defaultPreset.response.single({ data: { id: '1', name: 'Foo' } });
      expect(result.data).toEqual({ id: '1', name: 'Foo' });
    });

    it('uses raw object as fallback', () => {
      const result = defaultPreset.response.single({ id: '1', name: 'Foo' });
      expect(result.data).toEqual({ id: '1', name: 'Foo' });
    });
  });

  describe('response.list', () => {
    it('extracts items and meta', () => {
      const raw = {
        items: [{ id: '1' }],
        meta: { page: 1, size: 20, totalItems: 1, totalPages: 1 },
      };
      const result = defaultPreset.response.list(raw);
      expect(result.items).toHaveLength(1);
      expect(result.meta.page).toBe(1);
    });

    it('falls back to data array', () => {
      const result = defaultPreset.response.list({ data: [{ id: '1' }] });
      expect(result.items).toHaveLength(1);
    });
  });

  describe('response.error', () => {
    it('extracts error info', () => {
      const result = defaultPreset.response.error({ error: 'Bad', code: 'VALIDATION' });
      expect(result.error).toBe('Bad');
      expect(result.code).toBe('VALIDATION');
    });

    it('falls back to message field', () => {
      const result = defaultPreset.response.error({ message: 'Oops' });
      expect(result.error).toBe('Oops');
    });
  });

  describe('query config', () => {
    it('uses django filter style', () => {
      expect(defaultPreset.query.filterStyle).toBe('django');
    });

    it('has no page offset (1-indexed)', () => {
      expect(defaultPreset.query.pageOffset).toBeUndefined();
    });
  });
});
