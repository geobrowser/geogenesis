import { act, renderHook } from '@testing-library/react';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Debate } from '~/core/debates/api';
import { markDebateWatched } from '~/core/debates/watched-debates';

import { useNextDebate } from './use-next-debate';

const SPACE = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const ELSEWHERE = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
const CLAIMS = 'e614cce1c4ce45868304fd1237119eb2';
const VIDEOS = 'c48dc314fa7148aeb967139160456f1d';
const SUPPORTED_BY = 'd19fad5651364a7f8309daf5c7bf99dd';
const OPPOSED_BY = 'c57de77c3eee4e7ba0d2258d18aab11c';

const relation = (typeId: string, toId: string, spaceId = SPACE) => ({
  type: { id: typeId },
  toEntity: { id: toId },
  spaceId,
});
const debateEntity = (id: string, claimId: string) => ({
  id,
  name: id,
  relations: [
    relation(CLAIMS, claimId),
    relation(VIDEOS, `video-${id}`),
    relation(SUPPORTED_BY, `ada-${id}`),
    relation(OPPOSED_BY, `bo-${id}`),
    // Another space's edits to the same debate, which must not reach this space's card.
    relation(SUPPORTED_BY, `intruder-${id}`, ELSEWHERE),
    relation(VIDEOS, `foreign-video-${id}`, ELSEWHERE),
  ],
});

// Claims are named in this space, which is where the card reads the name from.
const claimName = (id: string) => ({
  property: { id: 'a126ca530c8e48d5b88882c734c38935' },
  spaceId: SPACE,
  value: `Claim ${id}`,
});

const mocks = vi.hoisted(() => ({
  keyframeInputs: [] as { relations: { spaceId: string }[] }[][],
}));

vi.mock('~/core/sync/use-store', () => ({
  useQueryEntities: ({ where }: { where: { id?: { in: string[] } } }) =>
    where.id
      ? {
          entities: where.id.in.map(id => ({ id, name: `Claim ${id}`, relations: [], values: [claimName(id)] })),
          isLoading: false,
        }
      : {
          entities: [debateEntity('current', 'c0'), debateEntity('first', 'c1'), debateEntity('second', 'c2')],
          isLoading: false,
        },
}));
vi.mock('./use-debates-best-order', () => ({
  useDebatesBestOrder: () => ({
    rankByDebateId: new Map([
      ['first', 0],
      ['second', 1],
    ]),
    isLoading: false,
    isError: false,
  }),
}));
vi.mock('~/core/claims/browse/use-debate-keyframes', () => ({
  useDebateKeyframes: (debates: { relations: { spaceId: string }[] }[]) => {
    mocks.keyframeInputs.push(debates);
    return new Map([['first', 'ipfs://first-frame']]);
  },
}));
vi.mock('~/core/hooks/use-profiles-by-space-ids', () => ({
  useProfilesBySpaceIds: (ids: string[]) => ({
    profilesBySpaceId: new Map(ids.map(id => [id, { name: id.startsWith('ada') ? 'Ada' : 'Bo', avatarUrl: null }])),
    isLoading: false,
  }),
}));

const debate = {
  id: 'current',
  claim: { space_id: SPACE, claim_entity_id: 'c0' },
} as unknown as Debate;

// A real Storage: the hook reads the watched list through its own module, as the player writes it.
function installStorage() {
  const store = new Map<string, string>();
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => void store.set(key, value),
      removeItem: (key: string) => void store.delete(key),
    },
  });
}

describe('useNextDebate', () => {
  beforeEach(() => {
    installStorage();
  });

  it('offers the best-ranked debate, with its key frame and its sides from the graph', () => {
    const { result } = renderHook(() => useNextDebate(debate, true));

    expect(result.current).toMatchObject({
      debateId: 'first',
      claimName: 'Claim c1',
      keyFrame: 'ipfs://first-frame',
      participants: [
        { spaceId: 'ada-first', name: 'Ada' },
        { spaceId: 'bo-first', name: 'Bo' },
      ],
    });
  });

  it('drops a suggestion the viewer finishes elsewhere while this card stays on screen', () => {
    // An ended card stays up as the feed scrolls on, and the debate it suggests can be finished
    // further down. Coming back to this card must not offer it again — and nothing about this card
    // changes in between, so only the watched list itself can say so.
    const { result } = renderHook(() => useNextDebate(debate, true));
    expect(result.current?.debateId).toBe('first');

    act(() => markDebateWatched('first'));

    expect(result.current?.debateId).toBe('second');
  });

  it('skips debates already watched before this one went live', () => {
    markDebateWatched('first');
    const { result } = renderHook(() => useNextDebate(debate, true));

    expect(result.current?.debateId).toBe('second');
  });

  it("reads the chosen debate's sides and video in this space only", () => {
    const { result } = renderHook(() => useNextDebate(debate, true));

    expect(result.current?.participants.map(participant => participant.spaceId)).toEqual(['ada-first', 'bo-first']);
    const handedToKeyframes = mocks.keyframeInputs.at(-1)!.flatMap(entity => entity.relations);
    expect(handedToKeyframes.length).toBeGreaterThan(0);
    expect(handedToKeyframes.every(relation => relation.spaceId === SPACE)).toBe(true);
  });

  it('suggests nothing while the debate has not been live', () => {
    const { result } = renderHook(() => useNextDebate(debate, false));
    expect(result.current).toBeNull();
  });
});
