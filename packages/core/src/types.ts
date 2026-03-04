// --- Response types (normalized internal format) ---

export interface ApiResponse<T> {
  data: T;
}

export interface PagedResponse<T> {
  items: T[];
  meta: PageMeta;
}

export interface PageMeta {
  page: number;
  size: number;
  totalItems: number;
  totalPages: number;
}

// --- Error payload (for serialization) ---

export interface FauxbaseErrorPayload {
  error: string;
  code: string;
  details?: Record<string, string>;
}

// --- Query types ---

export type FilterOperator =
  | 'eq' | 'ne' | 'gt' | 'gte' | 'lt' | 'lte'
  | 'like' | 'contains' | 'startswith' | 'endswith'
  | 'between' | 'in' | 'isnull';

export interface SortParams {
  field: string;
  direction: 'asc' | 'desc';
}

export interface QueryParams {
  filter?: Record<string, any>;
  sort?: SortParams;
  page?: number;
  size?: number;
}

// --- Entity base fields ---

export interface BaseFields {
  id: string;
  createdAt: string;
  updatedAt: string;
  createdById?: string;
  createdByName?: string;
  updatedById?: string;
  updatedByName?: string;
  deletedAt?: string | null;
  deletedById?: string;
  deletedByName?: string;
  version: number;
}

// --- Field decorator options ---

export interface FieldOptions {
  required?: boolean;
  default?: any;
  min?: number;
  max?: number;
}

// --- Driver config ---

export interface LocalDriverConfig {
  type: 'local';
  persist?: 'memory' | 'localStorage';
}

export interface HttpDriverConfig {
  type: 'http';
  baseUrl: string;
  preset?: string;
}

export type DriverConfig = LocalDriverConfig | HttpDriverConfig;

// --- Seed ---

export interface SeedDefinition<T = any> {
  entityName: string;
  entityClass: any;
  data: Array<Partial<T>>;
}

// --- Hook types ---

export type HookType = 'beforeCreate' | 'beforeUpdate' | 'afterCreate' | 'afterUpdate';
