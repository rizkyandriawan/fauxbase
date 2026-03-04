import { definePreset } from './types';

export const djangoPreset = definePreset({
  name: 'django',
  response: {
    single: (raw) => ({ data: raw }),
    list: (raw) => ({
      items: raw.results ?? [],
      meta: {
        page: 1, // Django REST doesn't always include page number
        size: raw.results?.length ?? 0,
        totalItems: raw.count ?? 0,
        totalPages: raw.count && raw.results?.length
          ? Math.ceil(raw.count / raw.results.length)
          : 0,
      },
    }),
    error: (raw) => ({
      error: raw.detail ?? raw.message ?? 'Unknown error',
      code: raw.status_code?.toString() ?? 'UNKNOWN',
      details: typeof raw === 'object' && !raw.detail
        ? Object.entries(raw).reduce((acc: Record<string, string>, [key, val]: [string, any]) => {
            if (key !== 'status_code') {
              acc[key] = Array.isArray(val) ? val[0] : String(val);
            }
            return acc;
          }, {})
        : undefined,
    }),
  },
  meta: { page: 'page', size: 'page_size', totalItems: 'count', totalPages: 'total_pages' },
  query: {
    filterStyle: 'django',
    pageParam: 'page',
    sizeParam: 'page_size',
    sortParam: 'ordering',
    sortFormat: 'field,direction',
  },
  auth: {
    loginUrl: '/api/auth/login/',
    registerUrl: '/api/auth/register/',
    logoutUrl: '/api/auth/logout/',
    tokenField: 'token',
    userField: 'user',
    headerFormat: 'Token {token}',
  },
});
