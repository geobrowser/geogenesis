import { SystemIds } from '@geoprotocol/geo-sdk/lite';

import { describe, expect, it } from 'vitest';

import { type FilterStateResult, parseFiltersSync } from '~/core/blocks/data/filters';

import { generateNewSpaceTemplateOps } from './generate-new-space-template';

const SPACE_ID = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const SPACE_HOME_ENTITY_ID = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';

type OpValue = { value?: { value?: unknown } };

function blockFilters() {
  return generateNewSpaceTemplateOps({ spaceId: SPACE_ID, spaceHomeEntityId: SPACE_HOME_ENTITY_ID })
    .flatMap(op => ('values' in op && Array.isArray(op.values) ? (op.values as OpValue[]) : []))
    .map(value => value.value?.value)
    .filter((value): value is string => typeof value === 'string' && value.includes('"filter"'))
    .map(parseFiltersSync);
}

const typeFilters = (parsed: FilterStateResult) =>
  parsed.filters.filter(filter => filter.columnId === SystemIds.TYPES_PROPERTY);

describe('generateNewSpaceTemplateOps', () => {
  it('asks the Recent news block for any of its types, not all of them', () => {
    const multiType = blockFilters().filter(parsed => typeFilters(parsed).length > 1);

    expect(multiType).toHaveLength(1);
    expect(multiType[0].mode).toBe('OR');
  });

  it('leaves the single-type blocks in AND mode', () => {
    const singleType = blockFilters().filter(parsed => typeFilters(parsed).length === 1);

    expect(singleType.length).toBeGreaterThan(0);
    expect(singleType.every(parsed => parsed.mode === 'AND')).toBe(true);
  });

  it('scopes every block to the new space', () => {
    const filters = blockFilters();

    expect(filters.length).toBeGreaterThan(0);
    expect(
      filters.every(parsed =>
        parsed.filters.some(filter => filter.columnId === SystemIds.SPACE_FILTER && filter.value === SPACE_ID)
      )
    ).toBe(true);
  });
});
