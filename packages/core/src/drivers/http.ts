import type { ApiResponse, HttpDriverConfig, PagedResponse, QueryParams } from '../types';
import type { Driver } from './types';
import type { Preset } from '../presets/types';
import { getPreset } from '../presets/index';
import { serializeQuery } from './query-serializer';
import {
  FauxbaseError,
  ForbiddenError,
  HttpError,
  NetworkError,
  NotFoundError,
  ConflictError,
  TimeoutError,
  ValidationError,
} from '../errors';

type AuthProvider = () => { token: string } | null;

interface HttpDriverOptions extends HttpDriverConfig {
  timeout?: number;
  retry?: { maxRetries?: number; baseDelay?: number };
  headers?: Record<string, string>;
}

export class HttpDriver implements Driver {
  private baseUrl: string;
  private preset: Preset;
  private timeout: number;
  private maxRetries: number;
  private baseDelay: number;
  private defaultHeaders: Record<string, string>;
  private endpoints = new Map<string, string>();
  private authProvider: AuthProvider | null = null;

  constructor(config: HttpDriverOptions) {
    this.baseUrl = config.baseUrl.replace(/\/$/, '');
    this.preset = typeof config.preset === 'string'
      ? getPreset(config.preset ?? 'default')
      : (config.preset as any) ?? getPreset('default');
    this.timeout = config.timeout ?? 30000;
    this.maxRetries = config.retry?.maxRetries ?? 3;
    this.baseDelay = config.retry?.baseDelay ?? 300;
    this.defaultHeaders = config.headers ?? {};
  }

  setAuthProvider(provider: AuthProvider): void {
    this.authProvider = provider;
  }

  registerEndpoint(resource: string, endpoint: string): void {
    this.endpoints.set(resource, endpoint);
  }

  private getEndpoint(resource: string): string {
    return this.endpoints.get(resource) ?? `/${resource}`;
  }

  private buildUrl(resource: string, id?: string): string {
    const endpoint = this.getEndpoint(resource);
    const base = `${this.baseUrl}${endpoint}`;
    return id ? `${base}/${id}` : base;
  }

  private buildHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...this.defaultHeaders,
    };

    const auth = this.authProvider?.();
    if (auth?.token) {
      headers['Authorization'] = this.preset.auth.headerFormat.replace('{token}', auth.token);
    }

    return headers;
  }

  private async request<T>(
    url: string,
    options: RequestInit = {},
    retryCount = 0,
  ): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(url, {
        ...options,
        headers: { ...this.buildHeaders(), ...(options.headers as Record<string, string> ?? {}) },
        signal: controller.signal,
      });

      clearTimeout(timer);

      if (!response.ok) {
        // Retry 5xx errors
        if (response.status >= 500 && retryCount < this.maxRetries) {
          const delay = this.baseDelay * Math.pow(2, retryCount);
          await new Promise(r => setTimeout(r, delay));
          return this.request<T>(url, options, retryCount + 1);
        }

        const body = await response.json().catch(() => ({}));
        this.throwMappedError(response.status, body);
      }

      // Handle 204 No Content
      if (response.status === 204) {
        return {} as T;
      }

      return response.json();
    } catch (err: any) {
      clearTimeout(timer);

      if (err instanceof FauxbaseError) throw err;

      if (err.name === 'AbortError') {
        throw new TimeoutError(`Request timed out after ${this.timeout}ms`);
      }

      throw new NetworkError(err.message ?? 'Network request failed');
    }
  }

  private throwMappedError(status: number, body: any): never {
    const parsed = this.preset.response.error(body);

    switch (true) {
      case status === 400 || status === 422:
        throw new ValidationError(parsed.error, parsed.details);
      case status === 401 || status === 403:
        throw new ForbiddenError(parsed.error);
      case status === 404:
        throw new NotFoundError(parsed.error);
      case status === 409:
        throw new ConflictError(parsed.error);
      default:
        throw new HttpError(parsed.error, status, parsed.details);
    }
  }

  async list<T>(resource: string, query: QueryParams): Promise<PagedResponse<T>> {
    const url = this.buildUrl(resource);
    const params = serializeQuery(query, this.preset.query);
    const queryString = params.toString();
    const fullUrl = queryString ? `${url}?${queryString}` : url;

    const raw = await this.request<any>(fullUrl);
    const parsed = this.preset.response.list(raw);

    return {
      items: parsed.items as T[],
      meta: {
        page: parsed.meta[this.preset.meta.page] ?? parsed.meta.page ?? query.page ?? 1,
        size: parsed.meta[this.preset.meta.size] ?? parsed.meta.size ?? query.size ?? 20,
        totalItems: parsed.meta[this.preset.meta.totalItems] ?? parsed.meta.totalItems ?? 0,
        totalPages: parsed.meta[this.preset.meta.totalPages] ?? parsed.meta.totalPages ?? 0,
      },
    };
  }

  async get<T>(resource: string, id: string): Promise<ApiResponse<T>> {
    const url = this.buildUrl(resource, id);
    const raw = await this.request<any>(url);
    return this.preset.response.single(raw) as ApiResponse<T>;
  }

  async create<T>(resource: string, data: Partial<T>): Promise<ApiResponse<T>> {
    const url = this.buildUrl(resource);
    const raw = await this.request<any>(url, {
      method: 'POST',
      body: JSON.stringify(data),
    });
    return this.preset.response.single(raw) as ApiResponse<T>;
  }

  async update<T>(resource: string, id: string, data: Partial<T>): Promise<ApiResponse<T>> {
    const url = this.buildUrl(resource, id);
    const raw = await this.request<any>(url, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
    return this.preset.response.single(raw) as ApiResponse<T>;
  }

  async delete<T>(resource: string, id: string): Promise<ApiResponse<T>> {
    const url = this.buildUrl(resource, id);
    const raw = await this.request<any>(url, {
      method: 'DELETE',
    });
    return this.preset.response.single(raw) as ApiResponse<T>;
  }

  async count(resource: string, filter?: Record<string, any>): Promise<number> {
    const url = `${this.buildUrl(resource)}/count`;
    const params = filter
      ? serializeQuery({ filter }, this.preset.query)
      : new URLSearchParams();
    const queryString = params.toString();
    const fullUrl = queryString ? `${url}?${queryString}` : url;

    const raw = await this.request<any>(fullUrl);
    return raw.count ?? raw.data?.count ?? 0;
  }

  async bulkCreate<T>(resource: string, data: Array<Partial<T>>): Promise<ApiResponse<T[]>> {
    const url = `${this.buildUrl(resource)}/bulk`;
    const raw = await this.request<any>(url, {
      method: 'POST',
      body: JSON.stringify(data),
    });
    const parsed = this.preset.response.single(raw);
    return { data: Array.isArray(parsed.data) ? parsed.data : [parsed.data] };
  }

  async bulkUpdate<T>(resource: string, updates: Array<{ id: string; data: Partial<T> }>): Promise<ApiResponse<T[]>> {
    const url = `${this.buildUrl(resource)}/bulk`;
    const raw = await this.request<any>(url, {
      method: 'PATCH',
      body: JSON.stringify(updates),
    });
    const parsed = this.preset.response.single(raw);
    return { data: Array.isArray(parsed.data) ? parsed.data : [parsed.data] };
  }

  async bulkDelete(resource: string, ids: string[]): Promise<ApiResponse<{ count: number }>> {
    const url = `${this.buildUrl(resource)}/bulk`;
    const raw = await this.request<any>(url, {
      method: 'DELETE',
      body: JSON.stringify({ ids }),
    });
    return { data: { count: raw.count ?? raw.data?.count ?? ids.length } };
  }

  // Seed methods are no-ops for HTTP — backend owns data
  seed(): void { /* no-op */ }
  getSeedVersion(): string | null { return null; }
  setSeedVersion(): void { /* no-op */ }
  clear(): void { /* no-op */ }
}
