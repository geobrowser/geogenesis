import { describe, expect, it } from 'vitest';

import { parseEntityTableQueryFilterFromParams, parseTripleQueryFilterFromParams } from './params';

describe('TripleStore params', () => {
  it('Parses triple store params from search params', () => {
    const params = parseTripleQueryFilterFromParams({
      query: 'banana',
      page: '1',
    });

    expect(params).toEqual({
      query: 'banana',
      pageNumber: 1,
      filterState: [],
    });
  });

  it('Parses triple store params from search params with no params', () => {
    const params = parseTripleQueryFilterFromParams({});
    expect(params).toEqual({
      query: '',
      pageNumber: 0,
      filterState: [],
    });
  });
});

describe('EntityTableStore params', () => {
  it('Parses triple store params from search params', () => {
    const params = parseEntityTableQueryFilterFromParams({
      page: '1',
      typeId: 'banana',
      query: 'name',
    });

    expect(params).toEqual({
      query: 'name',
      pageNumber: 1,
      typeId: 'banana',
      filterState: [],
    });
  });

  it('Parses triple store params from search params with no params', () => {
    const params = parseEntityTableQueryFilterFromParams({});

    expect(params).toEqual({
      query: '',
      pageNumber: 0,
      typeId: '',
      filterState: [],
    });
  });
});
