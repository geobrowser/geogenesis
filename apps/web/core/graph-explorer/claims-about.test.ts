import { describe, expect, it, vi } from 'vitest';

import { claimHomeSpaceId, claimsAboutVariables, decodeClaimsAbout } from './claims-about';
import { resolveGraphFilter } from './graph-filter';
import { CLAIM_ABOUT_PROPERTY_IDS, CLAIM_TYPE_ID } from './ontology';

vi.mock('~/core/utils/space/space-ranking', () => ({
  getTopRankedSpaceId: (ids: string[]) => (ids.length ? [...ids].sort()[0] : null),
}));

const SPACE_A = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const SPACE_B = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
const SPACE_C = 'cccccccccccccccccccccccccccccccc';
const ENTITY = '11111111111111111111111111111111';

describe('claimHomeSpaceId', () => {
  it('uses a space the claim is named in, inside the filter', () => {
    expect(
      claimHomeSpaceId({ spaceIds: [SPACE_A, SPACE_B, SPACE_C], nameSpaceIds: [SPACE_A, SPACE_C] }, [SPACE_C])
    ).toBe(SPACE_C);
  });

  it('falls back to where it is named when none of those is in the filter', () => {
    expect(claimHomeSpaceId({ spaceIds: [SPACE_A, SPACE_B], nameSpaceIds: [SPACE_B] }, [SPACE_C])).toBe(SPACE_B);
  });

  it('falls back to the claim’s spaces when no name space is known', () => {
    expect(claimHomeSpaceId({ spaceIds: [SPACE_B], nameSpaceIds: [] }, undefined)).toBe(SPACE_B);
  });
});

describe('decodeClaimsAbout', () => {
  const filter = resolveGraphFilter({ kind: 'spaces', spaceIds: [SPACE_B] });

  it('gives each claim its own space and drops unnamed claims', () => {
    const page = decodeClaimsAbout(
      {
        entitiesConnection: {
          nodes: [
            {
              id: '22222222-2222-2222-2222-222222222222',
              name: ' A claim ',
              spaceIds: [SPACE_A, SPACE_B],
              valuesList: [{ spaceId: SPACE_B }],
            },
            { id: '33333333333333333333333333333333', name: '', spaceIds: [SPACE_B], valuesList: [] },
          ],
          pageInfo: { hasNextPage: true, endCursor: 'cursor-1' },
        },
      },
      filter
    );
    expect(page).toEqual({
      claims: [{ id: '22222222222222222222222222222222', name: 'A claim', spaceId: SPACE_B }],
      endCursor: 'cursor-1',
      hasNextPage: true,
    });
  });

  it('reads an empty answer as no claims', () => {
    expect(decodeClaimsAbout({ entitiesConnection: null }, filter)).toEqual({
      claims: [],
      endCursor: null,
      hasNextPage: false,
    });
  });
});

describe('claimsAboutVariables', () => {
  it('asks for claims about the entity through every about-relation, scoped to the filter', () => {
    const variables = claimsAboutVariables(ENTITY, resolveGraphFilter({ kind: 'spaces', spaceIds: [SPACE_A] }), null);
    expect(variables).toMatchObject({
      id: ENTITY,
      aboutPropertyIds: CLAIM_ABOUT_PROPERTY_IDS,
      spaceIds: [SPACE_A],
      claimTypeId: CLAIM_TYPE_ID,
      after: null,
    });
  });

  it('sends null spaces for the global scope, which the API reads as no filter', () => {
    expect(claimsAboutVariables(ENTITY, resolveGraphFilter({ kind: 'global' }), 'c').spaceIds).toBeNull();
  });
});
