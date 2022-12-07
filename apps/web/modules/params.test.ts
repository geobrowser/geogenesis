import { describe, expect, it } from 'vitest';
import { configOptions } from './config';
import { getConfigFromUrl, parseQueryParameters, stringifyQueryParameters } from './params';

describe('TripleStore params', () => {
  it('Parses triple store params from url', () => {
    const params = parseQueryParameters(
      'https://banana.com/?query=banana&page=1&attribute-id=banana&entity-id=banana&linked-to=banana&attribute-name=banana&value=banana'
    );

    expect(params).toEqual({
      query: 'banana',
      pageNumber: 1,
      filterState: [
        { field: 'attribute-id', value: 'banana' },
        { field: 'entity-id', value: 'banana' },
        { field: 'linked-to', value: 'banana' },
        { field: 'attribute-name', value: 'banana' },
        { field: 'value', value: 'banana' },
      ],
    });
  });

  //   it('Parses triple store params from url with no query', () => {
  //     const params = parseQueryParameters('https://banana.com/');
  //     expect(params).toEqual({
  //       query: '',
  //       pageNumber: 0,
  //       filterState: [],
  //     });
  //   });

  //   it('Stringifies triple store params to url', () => {
  //     const params = stringifyQueryParameters({
  //       query: 'banana',
  //       pageNumber: 1,
  //       filterState: [
  //         { field: 'attribute-id', value: 'banana' },
  //         { field: 'entity-id', value: 'banana' },
  //         { field: 'linked-to', value: 'banana' },
  //         { field: 'attribute-name', value: 'banana' },
  //         { field: 'value', value: 'banana' },
  //       ],
  //     });

  //     expect(params).toBe(
  //       'query=banana&page=1&attribute-id=banana&entity-id=banana&linked-to=banana&attribute-name=banana&value=banana'
  //     );
  //   });

  //   it('Stringifies triple store params for entity-name into the regular query param', () => {
  //     const params = stringifyQueryParameters({
  //       query: 'banana',
  //       pageNumber: 0,
  //       filterState: [{ field: 'entity-name', value: 'banana' }],
  //     });

  //     expect(params).toBe('query=banana');
  //   });

  //   it('Stringifies triple store params to url with empty query', () => {
  //     const params = stringifyQueryParameters({
  //       query: '',
  //       pageNumber: 0,
  //       filterState: [],
  //     });
  //     expect(params).toBe('');
  //   });
});

// describe('Config params', () => {
//   it('Parses environment from url', () => {
//     const config = getConfigFromUrl('https://banana.com/?env=development');
//     expect(config).toEqual(configOptions.development);
//   });

//   it("Defaults to production if there's no param", () => {
//     const config = getConfigFromUrl('https://banana.com/');
//     expect(config).toEqual(configOptions.production);
//   });

//   it('Defaults to production if param not in configOptions', () => {
//     const config = getConfigFromUrl('https://banana.com/?env=banana');
//     expect(config).toEqual(configOptions.production);
//   });
// });
