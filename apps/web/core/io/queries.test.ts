import { describe, expect, it } from 'vitest';

import { groupRestResults } from './queries';

describe('groupRestResults', () => {
  it('groups nested REST search rows into search results', () => {
    const results = groupRestResults([
      {
        entityId: '11111111-1111-1111-1111-111111111111',
        space: {
          id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
          name: 'Alpha',
          avatar: 'ipfs://alpha',
        },
        name: 'Valid result',
        types: [{ id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb' }],
      },
      {
        entityId: '11111111-1111-1111-1111-111111111111',
        space: {
          id: 'cccccccc-cccc-cccc-cccc-cccccccccccc',
        },
        types: [{ id: 'dddddddd-dddd-dddd-dddd-dddddddddddd', name: 'Person' }],
      },
    ]);

    expect(results).toEqual([
      {
        id: '11111111111111111111111111111111',
        name: 'Valid result',
        description: null,
        types: [
          { id: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb', name: null },
          { id: 'dddddddddddddddddddddddddddddddd', name: 'Person' },
        ],
        typesBySpace: {
          aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa: [{ id: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb', name: null }],
          cccccccccccccccccccccccccccccccc: [{ id: 'dddddddddddddddddddddddddddddddd', name: 'Person' }],
        },
        spaces: [
          {
            id: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
            name: 'Alpha',
            description: null,
            image: 'ipfs://alpha',
            relations: [],
            spaceId: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
            spaces: ['aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'],
            values: [],
            types: [],
          },
          {
            id: 'cccccccccccccccccccccccccccccccc',
            name: null,
            description: null,
            image: '',
            relations: [],
            spaceId: 'cccccccccccccccccccccccccccccccc',
            spaces: ['cccccccccccccccccccccccccccccccc'],
            values: [],
            types: [],
          },
        ],
      },
    ]);
  });
});
