import type { QueryParams } from '../types';
import type { Preset } from '../presets/types';

type PresetQueryConfig = Preset['query'];

export function serializeQuery(query: QueryParams, config: PresetQueryConfig): URLSearchParams {
  const params = new URLSearchParams();

  // Filters
  if (query.filter) {
    serializeFilters(params, query.filter, config.filterStyle);
  }

  // Sort
  if (query.sort && config.sortParam) {
    const direction = query.sort.direction;
    if (config.sortParam === 'ordering') {
      // Django-style: -field for desc, field for asc
      params.set(config.sortParam, direction === 'desc' ? `-${query.sort.field}` : query.sort.field);
    } else if (config.sortFormat === 'field:direction') {
      params.set(config.sortParam, `${query.sort.field}:${direction}`);
    } else {
      // Default: field,direction
      params.set(config.sortParam, `${query.sort.field},${direction}`);
    }
  }

  // Pagination
  if (query.page !== undefined) {
    const pageOffset = config.pageOffset ?? 0;
    params.set(config.pageParam, String(query.page + pageOffset));
  }
  if (query.size !== undefined) {
    params.set(config.sizeParam, String(query.size));
  }

  return params;
}

function serializeFilters(
  params: URLSearchParams,
  filter: Record<string, any>,
  style: PresetQueryConfig['filterStyle'],
): void {
  for (const [key, value] of Object.entries(filter)) {
    if (value === undefined) continue;
    const serialized = typeof value === 'object' && !Array.isArray(value)
      ? JSON.stringify(value)
      : String(value);

    switch (style) {
      case 'django':
        // Passthrough: price__gte=100
        params.set(key, serialized);
        break;

      case 'dot':
        // Replace __ with .: price.gte=100
        params.set(key.replace(/__/g, '.'), serialized);
        break;

      case 'bracket': {
        // Wrap in filter[]: filter[price_gte]=100
        const bracketKey = key.replace(/__/g, '_');
        params.set(`filter[${bracketKey}]`, serialized);
        break;
      }

      case 'nestjs': {
        // Nested dot + $ prefix: filter.price.$gte=100
        const parts = key.split('__');
        if (parts.length === 2) {
          params.set(`filter.${parts[0]}.$${parts[1]}`, serialized);
        } else {
          params.set(`filter.${key}`, serialized);
        }
        break;
      }
    }
  }
}
