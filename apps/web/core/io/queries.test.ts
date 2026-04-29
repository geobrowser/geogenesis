import { describe, expect, it } from 'vitest';

import { buildSearchPath, groupRestResults } from './queries';

describe('buildSearchPath', () => {
  const ROOT = 'a19c345ab9866679b001d7d2138d88a1';
  const CURRENT = 'c9f267dcb0d270718c2a3c45a64afd32';
  const PERSONAL = 'f3dab79cb5a3d9d1759656dd5361d1c6';

  it('builds a minimal global path with default limit/offset', () => {
    expect(buildSearchPath({ query: 'football' })).toBe('/search?query=football&limit=10&offset=0');
  });

  it('omits additional_space_ids when the array is empty or undefined', () => {
    expect(buildSearchPath({ query: 'football', additionalSpaceIds: [] })).toBe(
      '/search?query=football&limit=10&offset=0'
    );
    expect(buildSearchPath({ query: 'football', additionalSpaceIds: undefined })).toBe(
      '/search?query=football&limit=10&offset=0'
    );
  });

  it('serializes additional_space_ids as a comma-joined list of hyphenated UUIDs', () => {
    const path = buildSearchPath({
      query: 'baseball',
      additionalSpaceIds: [ROOT, CURRENT, PERSONAL],
    });

    // URLSearchParams encodes commas as %2C.
    expect(path).toBe(
      '/search?query=baseball&limit=10&offset=0&additional_space_ids=' +
        'a19c345a-b986-6679-b001-d7d2138d88a1%2Cc9f267dc-b0d2-7071-8c2a-3c45a64afd32%2Cf3dab79c-b5a3-d9d1-7596-56dd5361d1c6'
    );
  });

  it('passes through ids that already contain hyphens', () => {
    const alreadyHyphenated = 'a19c345a-b986-6679-b001-d7d2138d88a1';
    const path = buildSearchPath({ query: 'q', additionalSpaceIds: [alreadyHyphenated] });
    expect(path).toContain('additional_space_ids=a19c345a-b986-6679-b001-d7d2138d88a1');
  });

  it('combines additional_space_ids with single-space scope and type_ids', () => {
    const path = buildSearchPath({
      query: 'q',
      spaceId: ROOT,
      typeIds: [CURRENT],
      additionalSpaceIds: [PERSONAL],
      limit: 25,
      offset: 50,
    });

    expect(path).toBe(
      '/search?query=q&limit=25&offset=50' +
        '&scope=SPACE_SINGLE&space_id=a19c345a-b986-6679-b001-d7d2138d88a1' +
        '&type_ids=c9f267dc-b0d2-7071-8c2a-3c45a64afd32' +
        '&additional_space_ids=f3dab79c-b5a3-d9d1-7596-56dd5361d1c6'
    );
  });
});

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
