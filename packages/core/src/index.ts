// Types
export type {
  ApiResponse,
  PagedResponse,
  PageMeta,
  FauxbaseErrorPayload,
  QueryParams,
  SortParams,
  FilterOperator,
  BaseFields,
  FieldOptions,
  DriverConfig,
  LocalDriverConfig,
  HttpDriverConfig,
  SeedDefinition,
  HookType,
} from './types';

// Errors
export {
  FauxbaseError,
  NotFoundError,
  ConflictError,
  ValidationError,
  ForbiddenError,
  NetworkError,
  TimeoutError,
  HttpError,
} from './errors';

// Entity
export { Entity, field, relation, computed } from './entity';

// Service
export { Service, beforeCreate, beforeUpdate, afterCreate, afterUpdate } from './service';

// Auth
export { AuthService } from './auth';
export type { AuthState, LoginCredentials, AuthContext } from './auth';

// Client
export { createClient } from './client';

// Seed
export { seed } from './seed';

// Driver types
export type { Driver } from './drivers/types';

// Drivers
export { LocalDriver } from './drivers/local';
export { HttpDriver } from './drivers/http';

// Presets
export type { Preset, FilterStyle } from './presets/types';
export { definePreset } from './presets/types';
export {
  getPreset,
  defaultPreset,
  springBootPreset,
  laravelPreset,
  djangoPreset,
  nestjsPreset,
  expressPreset,
} from './presets/index';
