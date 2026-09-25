import { Effect } from 'effect';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DESCRIPTION_PROPERTY } from '~/core/profile/history-ontology';

import { fetchProfileHistory } from './fetch-profile-history';

const graphqlMock = vi.fn();

vi.mock('~/core/environment', () => ({
  Environment: {
    getConfig: () => ({ api: 'https://example.com/graphql' }),
  },
}));

vi.mock('./graphql', () => ({
  graphql: (...args: unknown[]) => graphqlMock(...args),
}));

const ENTITY_ID = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const SPACE_ID = '11111111111111111111111111111111';

describe('fetchProfileHistory', () => {
  beforeEach(() => graphqlMock.mockReset());

  it("returns the person's space-scoped description with their history", async () => {
    graphqlMock.mockReturnValue(
      Effect.succeed({
        entity: {
          description: [{ text: '  Researcher exploring decentralized knowledge.  ' }],
          employment: [],
          education: [],
        },
      })
    );

    await expect(fetchProfileHistory(ENTITY_ID, SPACE_ID)).resolves.toEqual({
      description: 'Researcher exploring decentralized knowledge.',
      employment: [],
      education: [],
    });

    const query = (graphqlMock.mock.calls[0]?.[0] as { query: string }).query;
    const descriptionSelection = query.slice(query.indexOf('description:'), query.indexOf('employment:'));
    expect(descriptionSelection).toContain(`propertyId: { is: "${DESCRIPTION_PROPERTY}" }`);
    expect(descriptionSelection).toContain(`spaceId: { is: "${SPACE_ID}" }`);
  });

  it('returns no description when the profile has not filled one out', async () => {
    graphqlMock.mockReturnValue(Effect.succeed({ entity: { description: [], employment: [], education: [] } }));

    await expect(fetchProfileHistory(ENTITY_ID, SPACE_ID)).resolves.toMatchObject({ description: null });
  });
});
