import { Effect } from 'effect';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { fetchTopicMetadata } from './fetch-topic-metadata';

const graphqlMock = vi.fn();

vi.mock('~/core/environment', () => ({
  Environment: { getConfig: () => ({ api: 'https://example.com/graphql' }) },
}));
vi.mock('./graphql', () => ({ graphql: (...args: unknown[]) => graphqlMock(...args) }));

const TOPIC = '64dc796b3b2d41a29f904869d0b9e00a';
const CITING_SPACE = '11111111111111111111111111111111';
const HOME_SPACE = '41e851610e13a19441c4d980f2f2ce6b';

function entity(overrides: Record<string, unknown> = {}) {
  return {
    id: TOPIC,
    name: 'AI infrastructure',
    description: null,
    spaceIds: [CITING_SPACE, HOME_SPACE],
    names: [{ spaceId: HOME_SPACE, text: 'AI infrastructure' }],
    relationsList: [],
    spacesByTopicIdConnection: { totalCount: 0, nodes: [] },
    ...overrides,
  };
}

beforeEach(() => graphqlMock.mockReset());

describe('fetchTopicMetadata', () => {
  it('links a topic to the space that names it, not the first space that merely cites it', async () => {
    // The API lists a citing space first; the topic is only published (named) in HOME_SPACE.
    graphqlMock.mockReturnValue(Effect.succeed({ entities: [entity()] }));

    const metadata = await fetchTopicMetadata([TOPIC]);

    expect(metadata.get(TOPIC)?.homeSpaceId).toBe(HOME_SPACE);
  });

  it('falls back to the spaces it is in when no space names it', async () => {
    graphqlMock.mockReturnValue(Effect.succeed({ entities: [entity({ names: [], spaceIds: [HOME_SPACE] })] }));

    const metadata = await fetchTopicMetadata([TOPIC]);

    expect(metadata.get(TOPIC)?.homeSpaceId).toBe(HOME_SPACE);
  });

  it('asks for every id it was given, past the list default of 100', async () => {
    graphqlMock.mockReturnValue(Effect.succeed({ entities: [] }));
    const ids = Array.from({ length: 120 }, (_, i) => i.toString(16).padStart(32, '0'));

    await fetchTopicMetadata(ids);

    expect(graphqlMock.mock.calls[0][0].query).toContain('first: 120');
  });
});
