import { describe, expect, it } from 'vitest';

import { Environment } from '../environment';
import { getConfigFromUrl, parseEntityTableQueryFilterFromParams } from './params';

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

describe('Config params', () => {
  it('Parses environment from url', () => {
    const config = getConfigFromUrl('https://banana.com/?env=development', undefined);
    expect(config).toEqual(Environment.options.development);
  });

  it("Defaults to production if there's no param", () => {
    const config = getConfigFromUrl('https://banana.com/', undefined);
    expect(config).toEqual(Environment.options.production);
  });

  it('Defaults to production if param not in config options', () => {
    const config = getConfigFromUrl('https://banana.com/?env=banana', undefined);
    expect(config).toEqual(Environment.options.production);
  });

  it('Defaults to cookie environment if it exists', () => {
    const config = getConfigFromUrl('https://banana.com/', 'development');
    expect(config).toEqual(Environment.options.development);
  });

  it('Defaults to url param if both the param and cookie exists', () => {
    const config = getConfigFromUrl('https://banana.com/?env=production', 'development');
    expect(config).toEqual(Environment.options.production);
  });
});
