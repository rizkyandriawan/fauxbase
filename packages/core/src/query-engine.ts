import type { FilterOperator, PageMeta, PagedResponse, QueryParams, SortParams } from './types';

// --- Parse filter key ---

const OPERATORS: FilterOperator[] = [
  'startswith', 'endswith', 'contains', 'between', 'isnull',
  'like', 'gte', 'lte', 'gt', 'lt', 'ne', 'in', 'eq',
];

export function parseFilterKey(key: string): { field: string; operator: FilterOperator } {
  for (const op of OPERATORS) {
    const suffix = `__${op}`;
    if (key.endsWith(suffix)) {
      return { field: key.slice(0, -suffix.length), operator: op };
    }
  }
  return { field: key, operator: 'eq' };
}

// --- Match single operator ---

export function matchOperator(itemValue: any, operator: FilterOperator, filterValue: any): boolean {
  if (operator === 'isnull') {
    return filterValue
      ? (itemValue === null || itemValue === undefined)
      : (itemValue !== null && itemValue !== undefined);
  }

  if (itemValue === null || itemValue === undefined) return false;

  switch (operator) {
    case 'eq':         return itemValue === filterValue;
    case 'ne':         return itemValue !== filterValue;
    case 'gt':         return itemValue > filterValue;
    case 'gte':        return itemValue >= filterValue;
    case 'lt':         return itemValue < filterValue;
    case 'lte':        return itemValue <= filterValue;
    case 'like':
    case 'contains':   return String(itemValue).toLowerCase().includes(String(filterValue).toLowerCase());
    case 'startswith': return String(itemValue).toLowerCase().startsWith(String(filterValue).toLowerCase());
    case 'endswith':   return String(itemValue).toLowerCase().endsWith(String(filterValue).toLowerCase());
    case 'between':    return Array.isArray(filterValue) && itemValue >= filterValue[0] && itemValue <= filterValue[1];
    case 'in':         return Array.isArray(filterValue) && filterValue.includes(itemValue);
    default:           return false;
  }
}

// --- Apply filters ---

export function applyFilters<T extends Record<string, any>>(items: T[], filter: Record<string, any>): T[] {
  return items.filter(item => {
    for (const [key, value] of Object.entries(filter)) {
      const { field, operator } = parseFilterKey(key);
      if (!matchOperator(item[field], operator, value)) return false;
    }
    return true;
  });
}

// --- Sort ---

export function applySort<T extends Record<string, any>>(items: T[], sort?: SortParams): T[] {
  if (!sort) return items;
  return [...items].sort((a, b) => {
    const aVal = a[sort.field];
    const bVal = b[sort.field];
    if (aVal === bVal) return 0;
    if (aVal === null || aVal === undefined) return 1;
    if (bVal === null || bVal === undefined) return -1;
    const cmp = aVal < bVal ? -1 : 1;
    return sort.direction === 'desc' ? -cmp : cmp;
  });
}

// --- Paginate ---

export function applyPagination<T>(items: T[], page = 1, size = 20): { items: T[]; meta: PageMeta } {
  const totalItems = items.length;
  const totalPages = size > 0 ? Math.ceil(totalItems / size) : 0;
  const start = (page - 1) * size;
  const paged = items.slice(start, start + size);
  return {
    items: paged,
    meta: { page, size, totalItems, totalPages },
  };
}

// --- Composite: filter → sort → paginate ---

export function executeQuery<T extends Record<string, any>>(
  items: T[],
  query: QueryParams,
): PagedResponse<T> {
  let result = items;

  // Exclude soft-deleted records
  result = result.filter(item => !item.deletedAt);

  if (query.filter) {
    result = applyFilters(result, query.filter);
  }

  result = applySort(result, query.sort);
  return applyPagination(result, query.page, query.size);
}
