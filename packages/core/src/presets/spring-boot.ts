import { definePreset } from './types';

export const springBootPreset = definePreset({
  name: 'spring-boot',
  response: {
    single: (raw) => ({ data: raw }),
    list: (raw) => ({
      items: raw.content ?? [],
      meta: {
        page: (raw.pageable?.pageNumber ?? 0) + 1,
        size: raw.pageable?.pageSize ?? raw.size ?? 20,
        totalItems: raw.totalElements ?? 0,
        totalPages: raw.totalPages ?? 0,
      },
    }),
    error: (raw) => ({
      error: raw.message ?? raw.error ?? 'Unknown error',
      code: raw.status?.toString() ?? 'UNKNOWN',
      details: raw.errors?.reduce?.((acc: Record<string, string>, e: any) => {
        acc[e.field ?? e.code ?? 'unknown'] = e.defaultMessage ?? e.message ?? '';
        return acc;
      }, {}) ?? undefined,
    }),
  },
  meta: { page: 'page', size: 'size', totalItems: 'totalElements', totalPages: 'totalPages' },
  query: {
    filterStyle: 'dot',
    pageParam: 'page',
    sizeParam: 'size',
    sortParam: 'sort',
    sortFormat: 'field,direction',
    pageOffset: -1, // 0-indexed
  },
  auth: {
    loginUrl: '/api/auth/login',
    registerUrl: '/api/auth/register',
    tokenField: 'token',
    userField: 'user',
    headerFormat: 'Bearer {token}',
  },
});
