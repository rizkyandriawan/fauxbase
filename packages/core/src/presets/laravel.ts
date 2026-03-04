import { definePreset } from './types';

export const laravelPreset = definePreset({
  name: 'laravel',
  response: {
    single: (raw) => ({ data: raw.data ?? raw }),
    list: (raw) => ({
      items: raw.data ?? [],
      meta: {
        page: raw.meta?.current_page ?? raw.current_page ?? 1,
        size: raw.meta?.per_page ?? raw.per_page ?? 15,
        totalItems: raw.meta?.total ?? raw.total ?? 0,
        totalPages: raw.meta?.last_page ?? raw.last_page ?? 0,
      },
    }),
    error: (raw) => ({
      error: raw.message ?? 'Unknown error',
      code: raw.status?.toString() ?? 'UNKNOWN',
      details: raw.errors
        ? Object.entries(raw.errors).reduce((acc: Record<string, string>, [key, val]: [string, any]) => {
            acc[key] = Array.isArray(val) ? val[0] : val;
            return acc;
          }, {})
        : undefined,
    }),
  },
  meta: { page: 'current_page', size: 'per_page', totalItems: 'total', totalPages: 'last_page' },
  query: {
    filterStyle: 'bracket',
    pageParam: 'page',
    sizeParam: 'per_page',
    sortParam: 'sort',
    sortFormat: 'field,direction',
  },
  auth: {
    loginUrl: '/api/login',
    registerUrl: '/api/register',
    logoutUrl: '/api/logout',
    tokenField: 'token',
    userField: 'user',
    headerFormat: 'Bearer {token}',
  },
});
