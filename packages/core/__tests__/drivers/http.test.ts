import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { HttpDriver } from '../../src/drivers/http';
import { NotFoundError, ValidationError, ForbiddenError, ConflictError, TimeoutError, NetworkError } from '../../src/errors';

// Mock fetch
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

function jsonResponse(data: any, status = 200) {
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(data),
  });
}

describe('HttpDriver', () => {
  let driver: HttpDriver;

  beforeEach(() => {
    mockFetch.mockReset();
    driver = new HttpDriver({
      type: 'http',
      baseUrl: 'http://localhost:3000',
      preset: 'default',
      timeout: 5000,
      retry: { maxRetries: 0 }, // Disable retry for most tests
    });
    driver.registerEndpoint('product', '/products');
  });

  describe('list', () => {
    it('fetches list and parses response', async () => {
      mockFetch.mockReturnValueOnce(jsonResponse({
        items: [{ id: '1', name: 'Foo' }],
        meta: { page: 1, size: 20, totalItems: 1, totalPages: 1 },
      }));

      const result = await driver.list('product', {});
      expect(result.items).toHaveLength(1);
      expect(result.items[0].name).toBe('Foo');
      expect(result.meta.page).toBe(1);
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:3000/products',
        expect.objectContaining({ headers: expect.any(Object) }),
      );
    });

    it('serializes query params to URL', async () => {
      mockFetch.mockReturnValueOnce(jsonResponse({ items: [], meta: {} }));

      await driver.list('product', { page: 2, size: 10 });
      const url = mockFetch.mock.calls[0][0];
      expect(url).toContain('page=2');
      expect(url).toContain('size=10');
    });
  });

  describe('get', () => {
    it('fetches single resource by id', async () => {
      mockFetch.mockReturnValueOnce(jsonResponse({ data: { id: '1', name: 'Foo' } }));

      const result = await driver.get('product', '1');
      expect(result.data.name).toBe('Foo');
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:3000/products/1',
        expect.any(Object),
      );
    });
  });

  describe('create', () => {
    it('POSTs data and returns response', async () => {
      mockFetch.mockReturnValueOnce(jsonResponse({ data: { id: '1', name: 'New' } }));

      const result = await driver.create('product', { name: 'New' });
      expect(result.data.name).toBe('New');
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:3000/products',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ name: 'New' }),
        }),
      );
    });
  });

  describe('update', () => {
    it('PATCHes data by id', async () => {
      mockFetch.mockReturnValueOnce(jsonResponse({ data: { id: '1', name: 'Updated' } }));

      const result = await driver.update('product', '1', { name: 'Updated' });
      expect(result.data.name).toBe('Updated');
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:3000/products/1',
        expect.objectContaining({ method: 'PATCH' }),
      );
    });
  });

  describe('delete', () => {
    it('DELETEs resource by id', async () => {
      mockFetch.mockReturnValueOnce(jsonResponse({ data: { id: '1' } }));

      await driver.delete('product', '1');
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:3000/products/1',
        expect.objectContaining({ method: 'DELETE' }),
      );
    });
  });

  describe('count', () => {
    it('fetches count from /count endpoint', async () => {
      mockFetch.mockReturnValueOnce(jsonResponse({ count: 42 }));

      const result = await driver.count('product');
      expect(result).toBe(42);
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:3000/products/count',
        expect.any(Object),
      );
    });

    it('applies filter params to count', async () => {
      mockFetch.mockReturnValueOnce(jsonResponse({ count: 5 }));

      await driver.count('product', { status: 'active' });
      const url = mockFetch.mock.calls[0][0];
      expect(url).toContain('status=active');
    });
  });

  describe('bulk operations', () => {
    it('POST /bulk for bulkCreate', async () => {
      mockFetch.mockReturnValueOnce(jsonResponse({ data: [{ id: '1' }, { id: '2' }] }));

      const result = await driver.bulkCreate('product', [{ name: 'A' }, { name: 'B' }]);
      expect(result.data).toHaveLength(2);
      expect(mockFetch.mock.calls[0][0]).toBe('http://localhost:3000/products/bulk');
      expect(mockFetch.mock.calls[0][1].method).toBe('POST');
    });

    it('PATCH /bulk for bulkUpdate', async () => {
      mockFetch.mockReturnValueOnce(jsonResponse({ data: [{ id: '1', name: 'Updated' }] }));

      await driver.bulkUpdate('product', [{ id: '1', data: { name: 'Updated' } }]);
      expect(mockFetch.mock.calls[0][1].method).toBe('PATCH');
    });

    it('DELETE /bulk for bulkDelete', async () => {
      mockFetch.mockReturnValueOnce(jsonResponse({ count: 2 }));

      const result = await driver.bulkDelete('product', ['1', '2']);
      expect(result.data.count).toBe(2);
      expect(mockFetch.mock.calls[0][1].method).toBe('DELETE');
    });
  });

  describe('auth header', () => {
    it('injects Authorization header when auth provider set', async () => {
      driver.setAuthProvider(() => ({ token: 'my-token' }));
      mockFetch.mockReturnValueOnce(jsonResponse({ data: { id: '1' } }));

      await driver.get('product', '1');
      const headers = mockFetch.mock.calls[0][1].headers;
      expect(headers['Authorization']).toBe('Bearer my-token');
    });

    it('omits Authorization when no auth provider', async () => {
      mockFetch.mockReturnValueOnce(jsonResponse({ data: { id: '1' } }));

      await driver.get('product', '1');
      const headers = mockFetch.mock.calls[0][1].headers;
      expect(headers['Authorization']).toBeUndefined();
    });
  });

  describe('error mapping', () => {
    it('maps 400 to ValidationError', async () => {
      mockFetch.mockReturnValueOnce(jsonResponse({ error: 'Bad request', code: 'VALIDATION' }, 400));
      await expect(driver.get('product', '1')).rejects.toThrow(ValidationError);
    });

    it('maps 422 to ValidationError', async () => {
      mockFetch.mockReturnValueOnce(jsonResponse({ error: 'Unprocessable', code: 'VALIDATION' }, 422));
      await expect(driver.get('product', '1')).rejects.toThrow(ValidationError);
    });

    it('maps 401 to ForbiddenError', async () => {
      mockFetch.mockReturnValueOnce(jsonResponse({ error: 'Unauthorized' }, 401));
      await expect(driver.get('product', '1')).rejects.toThrow(ForbiddenError);
    });

    it('maps 403 to ForbiddenError', async () => {
      mockFetch.mockReturnValueOnce(jsonResponse({ error: 'Forbidden' }, 403));
      await expect(driver.get('product', '1')).rejects.toThrow(ForbiddenError);
    });

    it('maps 404 to NotFoundError', async () => {
      mockFetch.mockReturnValueOnce(jsonResponse({ error: 'Not found' }, 404));
      await expect(driver.get('product', '1')).rejects.toThrow(NotFoundError);
    });

    it('maps 409 to ConflictError', async () => {
      mockFetch.mockReturnValueOnce(jsonResponse({ error: 'Conflict' }, 409));
      await expect(driver.get('product', '1')).rejects.toThrow(ConflictError);
    });
  });

  describe('timeout', () => {
    it('throws TimeoutError on abort', async () => {
      mockFetch.mockImplementationOnce(() => new Promise((_, reject) => {
        setTimeout(() => {
          const err = new Error('The operation was aborted');
          err.name = 'AbortError';
          reject(err);
        }, 10);
      }));

      const fastDriver = new HttpDriver({
        type: 'http',
        baseUrl: 'http://localhost:3000',
        timeout: 1,
        retry: { maxRetries: 0 },
      });
      fastDriver.registerEndpoint('product', '/products');

      await expect(fastDriver.get('product', '1')).rejects.toThrow(TimeoutError);
    });
  });

  describe('network error', () => {
    it('throws NetworkError on fetch failure', async () => {
      mockFetch.mockRejectedValueOnce(new TypeError('Failed to fetch'));

      await expect(driver.get('product', '1')).rejects.toThrow(NetworkError);
    });
  });

  describe('retry', () => {
    it('retries 5xx errors with exponential backoff', async () => {
      const retryDriver = new HttpDriver({
        type: 'http',
        baseUrl: 'http://localhost:3000',
        retry: { maxRetries: 2, baseDelay: 10 },
      });
      retryDriver.registerEndpoint('product', '/products');

      // First two: 500, third: success
      mockFetch
        .mockReturnValueOnce(jsonResponse({ error: 'Server error' }, 500))
        .mockReturnValueOnce(jsonResponse({ error: 'Server error' }, 500))
        .mockReturnValueOnce(jsonResponse({ data: { id: '1', name: 'OK' } }));

      const result = await retryDriver.get('product', '1');
      expect(result.data.name).toBe('OK');
      expect(mockFetch).toHaveBeenCalledTimes(3);
    });
  });

  describe('seed methods (no-ops)', () => {
    it('seed is a no-op', () => {
      expect(() => driver.seed('product', [], class {})).not.toThrow();
    });

    it('getSeedVersion returns null', () => {
      expect(driver.getSeedVersion()).toBeNull();
    });

    it('setSeedVersion is a no-op', () => {
      expect(() => driver.setSeedVersion('v1')).not.toThrow();
    });

    it('clear is a no-op', () => {
      expect(() => driver.clear('product')).not.toThrow();
    });
  });

  describe('fallback endpoint', () => {
    it('uses /resource as fallback when endpoint not registered', async () => {
      mockFetch.mockReturnValueOnce(jsonResponse({ items: [], meta: {} }));

      await driver.list('unknown', {});
      expect(mockFetch.mock.calls[0][0]).toBe('http://localhost:3000/unknown');
    });
  });
});
