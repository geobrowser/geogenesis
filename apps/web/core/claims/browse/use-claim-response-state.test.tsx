import { renderHook } from '@testing-library/react';

import { describe, expect, it, vi } from 'vitest';

import type { Entity } from '~/core/types';

import { useClaimResponseState } from './use-claim-response-state';

// The response reads are a different hook with its own suite; this one is about what is derived
// from the row and the entity.
vi.mock('./claim-response-summary', async importOriginal => {
  const actual = await importOriginal<typeof import('./claim-response-summary')>();
  return {
    ...actual,
    useClaimResponseSummary: () => ({
      ...actual.summarizeClaimResponses(0, 0),
      isLoading: false,
      isViewerResponseLoading: false,
      hasCounts: true,
      viewerDirection: null,
      viewerSpaceId: null,
    }),
  };
});

const CLAIM = 'claim-1';
const SPACE = 'da4a6c1f9d4446f9832ff3b49a4400e0';
const CLAIM_IS_FACTUAL = 'da4a6c1f9d4446f9832ff3b49a4400ef';

function entityWith(values: unknown[] = [], relations: unknown[] = []): Entity {
  return { id: CLAIM, name: 'A claim', values, relations } as unknown as Entity;
}

function render(entity: Entity | null) {
  return renderHook(() => useClaimResponseState({ claimId: CLAIM, spaceId: SPACE, row: null, entity })).result;
}

/**
 * The guard `EntityVoteButtons` carried and the shared card dropped.
 *
 * An unpublished edit to the claim's "Is factual" value — or to its Claim type — puts the draft and
 * the published graph into disagreement about which vocabulary the claim uses. The kind selects
 * `voteKind` on the write, so responding across that disagreement publishes the wrong kind of vote,
 * not merely a mislabelled one.
 */
describe('useClaimResponseState and an unpublished vocabulary edit', () => {
  it('blocks responding while the factual flag has an unpublished local edit', () => {
    const result = render(
      entityWith([{ spaceId: SPACE, property: { id: CLAIM_IS_FACTUAL }, value: '1', isLocal: true }])
    );

    expect(result.current.responseBlockedReason).toBe('Publish the claim type change before responding.');
  });

  it('does not block once that edit has been published', () => {
    const result = render(
      entityWith([
        { spaceId: SPACE, property: { id: CLAIM_IS_FACTUAL }, value: '1', isLocal: true, hasBeenPublished: true },
      ])
    );

    expect(result.current.responseBlockedReason).toBeNull();
  });

  it('ignores a draft edit made in a different space', () => {
    // Responses are published per space, so an edit elsewhere says nothing about this one's
    // vocabulary.
    const result = render(
      entityWith([
        { spaceId: 'da4a6c1f9d4446f9832ff3b49a4400aa', property: { id: CLAIM_IS_FACTUAL }, value: '1', isLocal: true },
      ])
    );

    expect(result.current.responseBlockedReason).toBeNull();
  });

  it('leaves an ordinary claim alone', () => {
    expect(render(entityWith()).current.responseBlockedReason).toBeNull();
    expect(render(null).current.responseBlockedReason).toBeNull();
  });

  // Six surfaces feed this from lookups with different projections, and a narrow one omits the
  // arrays entirely. A missing field must cost a false negative, never an exception thrown mid
  // render — that would take the whole surface down rather than one claim's pills.
  it('survives an entity whose projection left the arrays out', () => {
    const thin = { id: CLAIM, name: 'A claim' } as unknown as Entity;

    expect(() => render(thin)).not.toThrow();
    expect(render(thin).current.responseBlockedReason).toBeNull();
  });
});
