import { describe, expect, it, vi } from 'vitest';

import type { Entity } from '~/core/types';

import { resolvePinnedBallot } from './use-my-ranking';

vi.mock('~/core/io/queries', () => ({ getAllEntities: vi.fn(), getEntity: vi.fn() }));
vi.mock('~/core/hooks/use-personal-space-id', () => ({ usePersonalSpaceId: () => ({ personalSpaceId: null }) }));

const RANK = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const A = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
const B = 'cccccccccccccccccccccccccccccccc';

const rank = { id: RANK } as Entity;
const pin = {
  rankId: RANK,
  orderedEntityIds: [A, B],
  baseline: { rankId: RANK, orderedEntityIds: [A] },
  publishedAtMs: 1,
};

describe('resolvePinnedBallot', () => {
  it('keeps the pin while an in-place edit is indexed under the same rank id but the old order', () => {
    const { ballot, dropPin } = resolvePinnedBallot({ rankEntity: rank, orderedEntityIds: [A] }, pin);
    expect(dropPin).toBe(false);
    expect(ballot.orderedEntityIds).toEqual([A, B]);
    expect(ballot.rankEntity?.id).toBe(RANK);
  });

  it('hands over to the index once it reads back the pinned order', () => {
    const indexed = { rankEntity: rank, orderedEntityIds: [A, B] };
    expect(resolvePinnedBallot(indexed, pin)).toEqual({ ballot: indexed, dropPin: true });
  });

  it('hands over when the index moves past our ballot to another device’s', () => {
    const indexed = { rankEntity: rank, orderedEntityIds: [B] };
    expect(resolvePinnedBallot(indexed, pin)).toEqual({ ballot: indexed, dropPin: true });
  });

  it('keeps the pin while a freshly minted rank is not listed yet', () => {
    const older = { id: 'dddddddddddddddddddddddddddddddd' } as Entity;
    const minted = { ...pin, baseline: { rankId: older.id, orderedEntityIds: [A] } };
    const { ballot, dropPin } = resolvePinnedBallot({ rankEntity: older, orderedEntityIds: [A] }, minted);
    expect(dropPin).toBe(false);
    expect(ballot.rankEntity?.id).toBe(RANK);
  });

  it('keeps the edited rank’s own creation time on the stand-in, so a rolling window doesn’t restart', () => {
    const inPlace = { ...pin, publishedAtMs: 9_000, baseline: { ...pin.baseline, createdAtMs: 1_000 } };
    const { ballot } = resolvePinnedBallot({ rankEntity: rank, orderedEntityIds: [A] }, inPlace);
    expect(ballot.rankEntity?.createdAt).toBe(1_000);
  });

  it('uses the publish time on the stand-in for a new rank', () => {
    const older = 'dddddddddddddddddddddddddddddddd';
    const minted = {
      ...pin,
      publishedAtMs: 9_000,
      baseline: { rankId: older, orderedEntityIds: [A], createdAtMs: 1_000 },
    };
    const { ballot } = resolvePinnedBallot({ rankEntity: { id: older } as Entity, orderedEntityIds: [A] }, minted);
    expect(ballot.rankEntity?.createdAt).toBe(9_000);
  });

  it('answers from the index with no pin', () => {
    const indexed = { rankEntity: null, orderedEntityIds: [] };
    expect(resolvePinnedBallot(indexed, null)).toEqual({ ballot: indexed, dropPin: false });
  });
});
