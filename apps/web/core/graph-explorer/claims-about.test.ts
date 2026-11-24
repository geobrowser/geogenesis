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
              names: [{ spaceId: SPACE_B, text: 'A claim' }],
              placed: [],
            },
            { id: '33333333333333333333333333333333', name: '', spaceIds: [SPACE_B], names: [], placed: [] },
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

  it('drops a claim hidden in any space, its read space or another', () => {
    const claim = (id: string, hidden: Array<{ spaceId: string; text: string | null; boolean: boolean | null }>) => ({
      id,
      name: id,
      spaceIds: [SPACE_B],
      names: [{ spaceId: SPACE_B, text: id }],
      placed: [],
      hidden,
    });
    const page = decodeClaimsAbout(
      {
        entitiesConnection: {
          nodes: [
            claim('44444444444444444444444444444444', [{ spaceId: SPACE_B, text: null, boolean: true }]),
            claim('55555555555555555555555555555555', [{ spaceId: SPACE_A, text: 'true', boolean: null }]),
            claim('66666666666666666666666666666666', [{ spaceId: SPACE_A, text: 'false', boolean: false }]),
            claim('77777777777777777777777777777777', []),
          ],
          pageInfo: { hasNextPage: false, endCursor: null },
        },
      },
      SPACE_B
    );
    expect(page.claims.map(entry => entry.id)).toEqual([
      '66666666666666666666666666666666',
      '77777777777777777777777777777777',
    ]);
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
    names: [
      { spaceId: SPACE_A, text: 'Named in A' },
      { spaceId: SPACE_B, text: 'Named in B' },
    ],
    placedSpaceIds: [],
  };

  it('keeps the requested space when the claim holds any other content there', () => {
    expect(claimSpaceId({ ...claim, placedSpaceIds: [SPACE_C] }, SPACE_C)).toBe(SPACE_C);
  });

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
  it('asks only for names and for which spaces hold other non-hidden values', () => {
    const variables = claimsAboutVariables(
      ENTITY,
      resolveGraphFilter({ spaceIds: null, topicId: null, topicSpaceId: null }),
      null
    );
    expect(variables.namePropertyId).toBe('a126ca530c8e48d5b88882c734c38935');
    expect(variables.unplacingPropertyIds).toContain('a126ca530c8e48d5b88882c734c38935');
    expect(variables.unplacingPropertyIds.length).toBeGreaterThan(1);
  });

  it('asks for claims about the entity through every about-relation, scoped to the filter', () => {
    const variables = claimsAboutVariables(
      ENTITY,
      resolveGraphFilter({ spaceIds: [SPACE_A], topicId: null, topicSpaceId: null }),
      null
    );
    expect(variables).toMatchObject({
      id: ENTITY,
      aboutPropertyIds: CLAIM_ABOUT_PROPERTY_IDS,
      spaceIds: [SPACE_A],
      claimTypeId: CLAIM_TYPE_ID,
      after: null,
    });
  });

  it('sends null spaces for the global scope, which the API reads as no filter', () => {
    expect(
      claimsAboutVariables(ENTITY, resolveGraphFilter({ spaceIds: null, topicId: null, topicSpaceId: null }), 'c')
        .spaceIds
    ).toBeNull();
  });
});

describe('claims topic filter', () => {
  const TOPIC = '44444444444444444444444444444444';
  const topicFilter = resolveGraphFilter({ spaceIds: [SPACE_A], topicId: TOPIC, topicSpaceId: null });

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
    const all = resolveGraphFilter({ spaceIds: [SPACE_A], topicId: TOPIC, topicSpaceId: null }, { lens: 'off' });
    expect(claimsAboutVariables(ENTITY, all, null)).not.toHaveProperty('topicId');
  });
});
