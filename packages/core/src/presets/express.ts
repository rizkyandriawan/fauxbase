import { definePreset } from './types';

export const expressPreset = definePreset({
  name: 'express',
  response: {
    single: (raw) => ({ data: raw.data ?? raw }),
    list: (raw) => ({
      items: raw.data ?? raw.items ?? [],
      meta: raw.meta ?? {},
    }),
    error: (raw) => ({
      error: raw.error ?? raw.message ?? 'Unknown error',
      code: raw.code ?? 'UNKNOWN',
      details: raw.details,
    }),
  },
  meta: { page: 'page', size: 'size', totalItems: 'totalItems', totalPages: 'totalPages' },
  query: {
    filterStyle: 'django',
    pageParam: 'page',
    sizeParam: 'size',
    sortParam: 'sort',
    sortFormat: 'field,direction',
  },
  auth: {
    loginUrl: '/api/auth/login',
    registerUrl: '/api/auth/register',
    logoutUrl: '/api/auth/logout',
    tokenField: 'token',
    userField: 'user',
    headerFormat: 'Bearer {token}',
  },
});
