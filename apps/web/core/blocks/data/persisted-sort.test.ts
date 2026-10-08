import { describe, expect, it } from 'vitest';

import { parsePersistedSort, serializeSort } from './persisted-sort';

const PROPERTY_ID = '85a4668a42fa4f488969c0a9de0c294b';

describe('parsePersistedSort', () => {
  it('reads the property sort shape written since GEO-1974', () => {
    expect(parsePersistedSort(JSON.stringify({ sort_by: PROPERTY_ID, sort_direction: 'descending' }))).toEqual({
      kind: 'property',
      columnId: PROPERTY_ID,
      direction: 'desc',
    });
    expect(parsePersistedSort(JSON.stringify({ sort_by: PROPERTY_ID, sort_direction: 'ascending' }))).toEqual({
      kind: 'property',
      columnId: PROPERTY_ID,
      direction: 'asc',
    });
  });

  it('reads built-in sorts from order_by', () => {
    expect(parsePersistedSort(JSON.stringify({ order_by: 'best', sort_direction: 'descending' }))).toEqual({
      kind: 'builtin',
      sort: 'best',
      direction: 'desc',
    });
    expect(parsePersistedSort(JSON.stringify({ order_by: 'created_at', sort_direction: 'ascending' }))).toEqual({
      kind: 'builtin',
      sort: 'created_at',
      direction: 'asc',
    });
  });

  it('prefers sort_by when both keys are present', () => {
    expect(
      parsePersistedSort(JSON.stringify({ sort_by: PROPERTY_ID, order_by: 'best', sort_direction: 'descending' }))
    ).toEqual({ kind: 'property', columnId: PROPERTY_ID, direction: 'desc' });
  });

  it.each([
    ['empty', ''],
    ['null', null],
    ['not json', 'best'],
    ['json scalar', '"best"'],
    ['json null', 'null'],
    ['missing direction', JSON.stringify({ sort_by: PROPERTY_ID })],
    ['missing key', JSON.stringify({ sort_direction: 'descending' })],
    ['empty sort_by', JSON.stringify({ sort_by: '', sort_direction: 'descending' })],
    ['unknown order_by', JSON.stringify({ order_by: 'updated_at', sort_direction: 'descending' })],
    ['prototype key as order_by', JSON.stringify({ order_by: 'toString', sort_direction: 'descending' })],
  ])('reads %s as no sort', (_label, raw) => {
    expect(parsePersistedSort(raw)).toBeNull();
  });
});

describe('serializeSort', () => {
  it('writes the property shape unchanged', () => {
    expect(JSON.parse(serializeSort({ kind: 'property', columnId: PROPERTY_ID, direction: 'desc' }))).toEqual({
      sort_by: PROPERTY_ID,
      sort_direction: 'descending',
    });
  });

  it('writes built-in sorts under order_by without a sort_by key', () => {
    expect(JSON.parse(serializeSort({ kind: 'builtin', sort: 'best', direction: 'desc' }))).toEqual({
      order_by: 'best',
      sort_direction: 'descending',
    });
    expect(JSON.parse(serializeSort({ kind: 'builtin', sort: 'created_at', direction: 'asc' }))).toEqual({
      order_by: 'created_at',
      sort_direction: 'ascending',
    });
  });

  it('clears with the empty string', () => {
    expect(serializeSort(null)).toBe('');
  });

  it.each([
    { kind: 'property', columnId: PROPERTY_ID, direction: 'asc' } as const,
    { kind: 'builtin', sort: 'best', direction: 'desc' } as const,
    { kind: 'builtin', sort: 'created_at', direction: 'desc' } as const,
  ])('round-trips %o', sort => {
    expect(parsePersistedSort(serializeSort(sort))).toEqual(sort);
  });
});
