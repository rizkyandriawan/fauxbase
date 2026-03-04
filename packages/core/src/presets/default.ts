import { definePreset } from './types';

export const defaultPreset = definePreset({
  name: 'default',
  response: {
    single: (raw) => ({ data: raw.data ?? raw }),
    list: (raw) => ({
      items: raw.items ?? raw.data ?? [],
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
    loginUrl: '/auth/login',
    registerUrl: '/auth/register',
    logoutUrl: '/auth/logout',
    tokenField: 'token',
    userField: 'user',
    headerFormat: 'Bearer {token}',
  },
});
