import { describe, expect, it, vi } from 'vitest';

import { claimSpaceId, claimsAboutVariables, claimsTopicFor, decodeClaimsAbout } from './claims-about';
import { resolveGraphFilter } from './graph-filter';
import { CLAIM_ABOUT_PROPERTY_IDS, CLAIM_TYPE_ID, TOPICS_PROPERTY_ID } from './ontology';

vi.mock('~/core/utils/space/space-ranking', () => ({
  getTopRankedSpaceId: (ids: string[]) => (ids.length ? [...ids].sort()[0] : null),
}));

const SPACE_A = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const SPACE_B = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
const SPACE_C = 'cccccccccccccccccccccccccccccccc';
const ENTITY = '11111111111111111111111111111111';

const NAME = 'a126ca530c8e48d5b88882c734c38935';

describe('decodeClaimsAbout', () => {
  it('drops unnamed claims and resolves each claim in its own space', () => {
    const page = decodeClaimsAbout(
      {
        entitiesConnection: {
          nodes: [
            {
              id: '22222222-2222-2222-2222-222222222222',
              name: ' A claim ',
              spaceIds: [SPACE_A, SPACE_B],
              valuesList: [{ propertyId: NAME, spaceId: SPACE_B, text: 'A claim' }],
            },
            { id: '33333333333333333333333333333333', name: '', spaceIds: [SPACE_B], valuesList: [] },
          ],
          pageInfo: { hasNextPage: true, endCursor: 'cursor-1' },
        },
      },
      SPACE_C
    );
    expect(page).toEqual({
      claims: [{ id: '22222222222222222222222222222222', name: 'A claim', spaceId: SPACE_B }],
      endCursor: 'cursor-1',
      hasNextPage: true,
    });
  });

  it('reads an empty answer as no claims', () => {
    expect(decodeClaimsAbout({ entitiesConnection: null }, SPACE_A)).toEqual({
      claims: [],
      endCursor: null,
      hasNextPage: false,
    });
  });
});

describe('claimSpaceId', () => {
  const claim = {
    spaceIds: [SPACE_A, SPACE_B, SPACE_C],
    values: [
      { propertyId: NAME, spaceId: SPACE_A, text: 'Named in A' },
      { propertyId: NAME, spaceId: SPACE_B, text: 'Named in B' },
    ],
  };

  it('keeps the requested space when the claim has content there', () => {
    expect(claimSpaceId(claim, SPACE_B)).toBe(SPACE_B);
  });

  it('moves to the claim’s own space when the requested one holds nothing of it', () => {
    expect(claimSpaceId(claim, SPACE_C)).toBe(SPACE_A);
  });

  it('uses the claim’s home space with no requested space', () => {
    expect(claimSpaceId(claim, null)).toBe(SPACE_A);
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

describe('claims topic filter', () => {
  const TOPIC = '44444444444444444444444444444444';
  const topicFilter = resolveGraphFilter({ kind: 'spaces', spaceIds: [SPACE_A], topicId: TOPIC });

  it('asks claims about another entity to carry the topic too', () => {
    expect(claimsTopicFor(ENTITY, topicFilter)).toBe(TOPIC);
    expect(claimsAboutVariables(ENTITY, topicFilter, null)).toMatchObject({
      topicsPropertyId: TOPICS_PROPERTY_ID,
      topicId: TOPIC,
    });
  });

  it('adds nothing when the centre is the topic itself', () => {
    expect(claimsTopicFor(TOPIC, topicFilter)).toBeNull();
    expect(claimsAboutVariables(TOPIC, topicFilter, null)).not.toHaveProperty('topicId');
  });

  it('adds nothing when the filter is lifted', () => {
    const all = resolveGraphFilter({ kind: 'spaces', spaceIds: [SPACE_A], topicId: TOPIC }, { claims: 'all' });
    expect(claimsAboutVariables(ENTITY, all, null)).not.toHaveProperty('topicId');
  });
});
