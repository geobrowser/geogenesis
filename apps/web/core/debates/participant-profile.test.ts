import { Effect } from 'effect';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ProfileHistory } from '~/core/io/subgraph/fetch-profile-history';

import { fetchParticipantProfile } from './participant-profile';

const PERSONAL = '11111111111111111111111111111111';
const OTHER_PERSONAL = '22222222222222222222222222222222';
const PERSON = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const ROOT = 'a19c345ab9866679b001d7d2138d88a1';
const CRYPTO = 'c9f267dcb0d270718c2a3c45a64afd32';
const AI = '41e851610e13a19441c4d980f2f2ce6b';

const mocks = vi.hoisted(() => ({
  graphql: vi.fn(),
  history: vi.fn<(entityId: string, spaceId: string) => Promise<ProfileHistory>>(),
}));
vi.mock('~/core/io/subgraph/graphql', () => ({ graphql: (...args: unknown[]) => mocks.graphql(...args) }));
vi.mock('~/core/io/subgraph/fetch-profile-history', () => ({
  fetchProfileHistory: (entityId: string, spaceId: string) => mocks.history(entityId, spaceId),
}));

const emptyHistory = (): ProfileHistory => ({ tagline: null, description: null, employment: [], education: [] });
const identities = (spaceIds: string[]) => ({
  spaceIds,
  names: spaceIds.map(spaceId => ({ spaceId, text: `Name ${spaceId}` })),
  avatars: spaceIds.map(spaceId => ({ spaceId, toEntity: { urls: [{ text: `ipfs://${spaceId}` }] } })),
});

beforeEach(() => {
  mocks.graphql.mockReset();
  mocks.history.mockReset();
  mocks.history.mockResolvedValue(emptyHistory());
});

function respond(entity: ReturnType<typeof identities>) {
  mocks.graphql.mockImplementation(({ query }: { query: string }) =>
    Effect.succeed(
      query.includes('entity(id:')
        ? { entity }
        : {
            spaces: entity.spaceIds.map(id => ({
              id,
              type: id === PERSONAL || id === OTHER_PERSONAL ? 'PERSONAL' : 'DAO',
            })),
          }
    )
  );
}

describe('fetchParticipantProfile', () => {
  it('keeps all personal fields and skips public enrichment when complete', async () => {
    respond(identities([ROOT, PERSONAL]));
    mocks.history.mockResolvedValue({ ...emptyHistory(), tagline: 'My tagline', description: 'My description' });
    await expect(fetchParticipantProfile(PERSON, PERSONAL)).resolves.toEqual({
      name: `Name ${PERSONAL}`,
      avatarUrl: `ipfs://${PERSONAL}`,
      byline: 'My tagline',
    });
    expect(mocks.graphql).toHaveBeenCalledTimes(1);
    expect(mocks.history).toHaveBeenCalledExactlyOnceWith(PERSON, PERSONAL);
  });

  it('fills missing identity fields by rank while preserving a personal description over a public tagline', async () => {
    const entity = identities([AI, CRYPTO, PERSONAL]);
    entity.names = entity.names.filter(value => value.spaceId !== PERSONAL);
    entity.avatars = entity.avatars.filter(value => value.spaceId !== PERSONAL);
    respond(entity);
    mocks.history.mockImplementation(async (_, spaceId) => ({
      ...emptyHistory(),
      ...(spaceId === PERSONAL ? { description: 'My description' } : { tagline: 'Public tagline' }),
    }));
    await expect(fetchParticipantProfile(PERSON, PERSONAL)).resolves.toEqual({
      name: `Name ${CRYPTO}`,
      avatarUrl: `ipfs://${CRYPTO}`,
      byline: 'My description',
    });
    expect(mocks.history).toHaveBeenCalledTimes(1);
  });

  it('skips other personal spaces and uses the highest ranked public space with a byline', async () => {
    const entity = identities([OTHER_PERSONAL, AI, CRYPTO, ROOT, PERSONAL]);
    entity.names = entity.names.filter(value => value.spaceId !== PERSONAL);
    // A whitespace name in the best-ranked space is missing, so Crypto supplies it.
    entity.names.find(value => value.spaceId === ROOT)!.text = '  ';
    entity.avatars = entity.avatars.filter(value => value.spaceId !== PERSONAL);
    respond(entity);
    mocks.history.mockImplementation(async (_, spaceId) => ({
      ...emptyHistory(),
      tagline: spaceId === PERSONAL || spaceId === ROOT ? null : `Tagline ${spaceId}`,
    }));
    await expect(fetchParticipantProfile(PERSON, PERSONAL)).resolves.toEqual({
      name: `Name ${CRYPTO}`,
      avatarUrl: `ipfs://${ROOT}`,
      byline: `Tagline ${CRYPTO}`,
    });
    expect(mocks.history.mock.calls.map(call => call[1])).toEqual([PERSONAL, ROOT, CRYPTO]);
  });

  it('prefers a public current affiliation over its description when no tagline exists', async () => {
    respond(identities([PERSONAL, CRYPTO]));
    mocks.history.mockImplementation(async (_, spaceId) =>
      spaceId === PERSONAL
        ? emptyHistory()
        : ({
            ...emptyHistory(),
            description: 'Public description',
            employment: [
              {
                organization: { id: 'org', name: 'Geo' },
                entries: [
                  {
                    subject: { id: 'role', name: 'Engineer' },
                    startDate: null,
                    endDate: null,
                    status: 'current',
                  },
                ],
              },
            ],
          } as ProfileHistory)
    );
    expect((await fetchParticipantProfile(PERSON, PERSONAL)).byline).toBe('Engineer at Geo');
  });

  it('uses the public description when no tagline or current affiliation exists', async () => {
    respond(identities([PERSONAL, CRYPTO]));
    mocks.history.mockImplementation(async (_, spaceId) => ({
      ...emptyHistory(),
      description: spaceId === CRYPTO ? 'Public description' : null,
    }));
    expect((await fetchParticipantProfile(PERSON, PERSONAL)).byline).toBe('Public description');
  });

  it('does not request public spaces for a single-space person', async () => {
    respond(identities([PERSONAL]));
    expect((await fetchParticipantProfile(PERSON, PERSONAL)).byline).toBeNull();
    expect(mocks.graphql).toHaveBeenCalledTimes(1);
  });

  it('normalizes dashed ids when selecting personal fields', async () => {
    const dashed = '11111111-1111-1111-1111-111111111111';
    respond(identities([dashed]));
    expect((await fetchParticipantProfile(PERSON, PERSONAL)).name).toBe(`Name ${dashed}`);
    expect(mocks.graphql).toHaveBeenCalledTimes(1);
  });

  it('keeps personal fields if public enrichment fails', async () => {
    respond(identities([PERSONAL, CRYPTO]));
    mocks.history.mockImplementation(async (_, spaceId) => {
      if (spaceId !== PERSONAL) throw new Error('Unavailable');
      return emptyHistory();
    });
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    await expect(fetchParticipantProfile(PERSON, PERSONAL)).resolves.toEqual({
      name: `Name ${PERSONAL}`,
      avatarUrl: `ipfs://${PERSONAL}`,
      byline: null,
    });
    error.mockRestore();
  });
});
