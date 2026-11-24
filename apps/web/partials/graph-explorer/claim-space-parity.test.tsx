import { SystemIds } from '@geoprotocol/geo-sdk/lite';
import { cleanup, render } from '@testing-library/react';

import * as React from 'react';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { decodeClaimsAbout } from '~/core/graph-explorer/claims-about';
import { entitySpaceId, namedSpaceIds } from '~/core/graph-explorer/spokes';
import { TopicClaimCard } from '~/core/topics/browse/topic-claim-card';
import type { Entity } from '~/core/types';
import { entityHomeSpaceId } from '~/core/utils/space/entity-home-space';

// The space ranking is real here: parity has to hold under the ranking both surfaces actually use.
const mocks = vi.hoisted(() => ({ cardSpaceIds: [] as string[] }));

vi.mock('~/core/debates/hooks', () => ({
  useDebateClaims: (spaceId: string) => {
    mocks.cardSpaceIds.push(spaceId);
    return { data: undefined };
  },
}));
vi.mock('~/core/claims/browse/use-claim-response-state', () => ({
  useClaimResponseState: ({ spaceId }: { spaceId: string }) => {
    mocks.cardSpaceIds.push(spaceId);
    return {};
  },
}));
vi.mock('~/core/debates/matchmaking/matchmaking-claim-card', () => ({ MatchmakingClaimCard: () => null }));

const WORLD_AFFAIRS = '89bd89bf28ff8a0963faf92a8c905e20';
const PODCASTS = 'b5a31f8182b042437ede0f84ee02f104';
const DATASETS = 'da96a4c26e718bfa6c27c3b1f3c316cd';
const HEALTH = '52c7ae149838b6d47ce0f3b2a5974546';
const CLAIM = '0888a2f8621e4ee8bd77d1d57237927f';
const NAME = SystemIds.NAME_PROPERTY as string;

const TITLE = 'Netanyahu stated intentions to destroy Hamas';
// Named in Podcasts and Datasets, described in Health, cited from World affairs by a relation only.
const spaces = [WORLD_AFFAIRS, PODCASTS, DATASETS, HEALTH];
const values = [
  { propertyId: NAME, spaceId: PODCASTS, text: TITLE },
  { propertyId: NAME, spaceId: DATASETS, text: TITLE },
  { propertyId: SystemIds.DESCRIPTION_PROPERTY as string, spaceId: HEALTH, text: 'A description' },
];

function graphSpace(routeSpaceId: string) {
  const page = decodeClaimsAbout(
    {
      entitiesConnection: {
        nodes: [
          {
            id: CLAIM,
            name: TITLE,
            spaceIds: spaces,
            names: values.filter(value => value.propertyId === NAME),
            placed: values.filter(value => value.propertyId !== NAME).map(value => ({ spaceId: value.spaceId })),
          },
        ],
        pageInfo: { hasNextPage: false, endCursor: null },
      },
    },
    routeSpaceId
  );
  return page.claims[0]?.spaceId;
}

function cardSpace(routeSpaceId: string) {
  mocks.cardSpaceIds.length = 0;
  const claim = {
    id: CLAIM,
    name: TITLE,
    description: null,
    spaces,
    types: [],
    relations: [],
    values: values.map(value => ({ property: { id: value.propertyId }, spaceId: value.spaceId, value: value.text })),
  } as unknown as Entity;
  render(<TopicClaimCard claim={claim} fallbackSpaceId={routeSpaceId} />);
  return mocks.cardSpaceIds[0];
}

afterEach(cleanup);

describe('graph explorer and topic page resolve a claim to the same space', () => {
  it.each([
    ['a route space the claim is named in', PODCASTS],
    ['a route space that only cites it', WORLD_AFFAIRS],
    ['a route space holding only its description', HEALTH],
    ['a route space it is absent from', '41e851610e13a19441c4d980f2f2ce6b'],
  ])('with %s', (_case, routeSpaceId) => {
    const card = cardSpace(routeSpaceId);
    expect(card).toBeTruthy();
    expect(graphSpace(routeSpaceId)).toBe(card);
  });
});

describe('a topic named in two in-scope spaces, with no ?space', () => {
  // The topic page opens a topic in its home space and renders its claim cards from there.
  const topic = {
    spaces: [WORLD_AFFAIRS, PODCASTS],
    values: [WORLD_AFFAIRS, PODCASTS].map(spaceId => ({ property: { id: NAME }, spaceId, value: 'Gaza' })),
  };
  const topicPageSpace = entityHomeSpaceId(topic)!;

  it('picks the topic page’s space as the topic space', () => {
    const graphTopicSpace = entitySpaceId(
      { spaceIds: topic.spaces, namedSpaceIds: namedSpaceIds(topic.values) },
      [WORLD_AFFAIRS, PODCASTS, DATASETS],
      null
    );
    expect(graphTopicSpace).toBe(topicPageSpace);
  });

  it('then resolves its claims to the space the topic page’s card votes in', () => {
    const card = cardSpace(topicPageSpace);
    expect(card).toBeTruthy();
    expect(graphSpace(topicPageSpace)).toBe(card);
  });
});
