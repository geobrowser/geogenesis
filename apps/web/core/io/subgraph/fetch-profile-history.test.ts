import { Effect } from 'effect';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DESCRIPTION_PROPERTY } from '~/core/profile/history-ontology';
import { TAGLINE_PROPERTY } from '~/core/profile/profile-ontology';

import { fetchProfileHistory, loadProfileHistory } from './fetch-profile-history';

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
          tagline: [{ text: '  Building debates on Geo  ' }],
          description: [{ text: '  Researcher exploring decentralized knowledge.  ' }],
          employment: [],
          education: [],
        },
      })
    );

    await expect(fetchProfileHistory(ENTITY_ID, SPACE_ID)).resolves.toEqual({
      tagline: 'Building debates on Geo',
      description: 'Researcher exploring decentralized knowledge.',
      employment: [],
      education: [],
    });

    const query = (graphqlMock.mock.calls[0]?.[0] as { query: string }).query;
    const taglineSelection = query.slice(query.indexOf('tagline:'), query.indexOf('description:'));
    expect(taglineSelection).toContain(`propertyId: { is: "${TAGLINE_PROPERTY}" }`);
    expect(taglineSelection).toContain(`spaceId: { is: "${SPACE_ID}" }`);

    const descriptionSelection = query.slice(query.indexOf('description:'), query.indexOf('employment:'));
    expect(descriptionSelection).toContain(`propertyId: { is: "${DESCRIPTION_PROPERTY}" }`);
    expect(descriptionSelection).toContain(`spaceId: { is: "${SPACE_ID}" }`);
  });

  it('returns no tagline or description when the profile has not filled them out', async () => {
    graphqlMock.mockReturnValue(
      Effect.succeed({ entity: { tagline: [], description: [], employment: [], education: [] } })
    );

    await expect(fetchProfileHistory(ENTITY_ID, SPACE_ID)).resolves.toMatchObject({
      tagline: null,
      description: null,
    });
  });

  // A partial answer can drop a selection altogether rather than return it empty. Reading `[0]`
  // straight off it turned that into a thrown request and an unavailable profile.
  it('survives an answer that leaves a selection out entirely', async () => {
    graphqlMock.mockReturnValue(Effect.succeed({ entity: { employment: [], education: [] } }));

    await expect(fetchProfileHistory(ENTITY_ID, SPACE_ID)).resolves.toMatchObject({
      tagline: null,
      description: null,
    });
  });
});

describe('loadProfileHistory', () => {
  beforeEach(() => graphqlMock.mockReset());

  it('sends the histories asked for in one tick as one aliased query', async () => {
    const OTHER_ID = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
    graphqlMock.mockReturnValue(
      Effect.succeed({
        p0: { tagline: [{ text: 'First' }], description: [], employment: [], education: [] },
        p1: { tagline: [{ text: 'Second' }], description: [], employment: [], education: [] },
      })
    );

    const [first, second] = await Promise.all([
      loadProfileHistory(ENTITY_ID, SPACE_ID),
      loadProfileHistory(OTHER_ID, SPACE_ID),
    ]);

    expect(graphqlMock).toHaveBeenCalledTimes(1);
    const query = (graphqlMock.mock.calls[0]?.[0] as { query: string }).query;
    expect(query).toMatch(new RegExp(`p0:\\s*entity\\(id: "${ENTITY_ID}"\\)`));
    expect(query).toMatch(new RegExp(`p1:\\s*entity\\(id: "${OTHER_ID}"\\)`));
    expect(first.tagline).toBe('First');
    expect(second.tagline).toBe('Second');
  });
});
