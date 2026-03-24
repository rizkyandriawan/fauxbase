export type FilterStyle = 'django' | 'dot' | 'bracket' | 'nestjs';

export interface Preset {
  name: string;
  response: {
    single: (raw: any) => { data: any };
    list: (raw: any) => { items: any[]; meta: Record<string, any> };
    error: (raw: any) => { error: string; code: string; details?: Record<string, string> };
  };
  meta: { page: string; size: string; totalItems: string; totalPages: string };
  query: {
    filterStyle: FilterStyle;
    pageParam: string;
    sizeParam: string;
    sortParam?: string;
    sortFormat: string; // 'field,direction' | 'field:direction'
    pageOffset?: number; // 0 = 1-indexed (default), -1 = 0-indexed
  };
  auth: {
    loginUrl: string;
    registerUrl: string;
    logoutUrl?: string;
    refreshUrl?: string;
    tokenField: string;
    refreshTokenField?: string;
    expiresInField?: string;
    userField: string;
    headerFormat: string; // 'Bearer {token}'
  };
}

export function definePreset(config: Preset): Preset {
  return config;
}
