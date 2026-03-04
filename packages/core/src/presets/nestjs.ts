import { definePreset } from './types';

export const nestjsPreset = definePreset({
  name: 'nestjs',
  response: {
    single: (raw) => ({ data: raw.data ?? raw }),
    list: (raw) => ({
      items: raw.data ?? raw.items ?? [],
      meta: raw.meta ?? {},
    }),
    error: (raw) => ({
      error: raw.message ?? 'Unknown error',
      code: raw.error ?? raw.statusCode?.toString() ?? 'UNKNOWN',
      details: raw.message && Array.isArray(raw.message)
        ? raw.message.reduce((acc: Record<string, string>, msg: string, i: number) => {
            acc[`field_${i}`] = msg;
            return acc;
          }, {})
        : undefined,
    }),
  },
  meta: { page: 'page', size: 'limit', totalItems: 'totalItems', totalPages: 'totalPages' },
  query: {
    filterStyle: 'nestjs',
    pageParam: 'page',
    sizeParam: 'limit',
    sortParam: 'sort',
    sortFormat: 'field:direction',
  },
  auth: {
    loginUrl: '/auth/login',
    registerUrl: '/auth/register',
    tokenField: 'access_token',
    userField: 'user',
    headerFormat: 'Bearer {token}',
  },
});
