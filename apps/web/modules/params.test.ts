import { describe, expect, it } from 'vitest';
import { parseQueryParameters, stringifyQueryParameters } from './params';

describe('TripleStore params', () => {
  it('Parses triple store params from url', () => {
    const params = parseQueryParameters('https://banana.com/?query=banana&page=1');
    expect(params).toEqual({
      query: 'banana',
      pageNumber: 1,
    });
  });

  it('Parses triple store params from url with no query', () => {
    const params = parseQueryParameters('https://banana.com/');
    expect(params).toEqual({
      query: '',
      pageNumber: 0,
    });
  });

  it('Stringifies triple store params to url', () => {
    const params = stringifyQueryParameters({
      query: 'banana',
      pageNumber: 1,
    });
    expect(params).toBe('query=banana&page=1');
  });

  it('Stringifies triple store params to url with empty query', () => {
    const params = stringifyQueryParameters({
      query: '',
      pageNumber: 0,
    });
    expect(params).toBe('');
  });
});
