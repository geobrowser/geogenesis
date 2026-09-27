import { SystemIds } from '@geoprotocol/geo-sdk/lite';
import { renderHook } from '@testing-library/react';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { CLAIM_TYPE_ID } from '~/core/claims/ontology';
import type { DebateClaim } from '~/core/debates/api';
import type { Entity } from '~/core/types';

import { useClaimResponseState } from './use-claim-response-state';

const mocks = vi.hoisted(() => ({ summary: {} as Record<string, unknown> }));

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
      indexedViewerDirection: null,
      viewerSpaceId: null,
      ...mocks.summary,
    }),
  };
});

beforeEach(() => {
  mocks.summary = {};
});

const CLAIM = 'claim-1';
const SPACE = 'da4a6c1f9d4446f9832ff3b49a4400e0';
const CLAIM_IS_FACTUAL = 'da4a6c1f9d4446f9832ff3b49a4400ef';

function entityWith(values: unknown[] = [], relations: unknown[] = []): Entity {
  return { id: CLAIM, name: 'A claim', values, relations } as unknown as Entity;
}

function render(entity: Entity | null, row: DebateClaim | null = null) {
  return renderHook(() => useClaimResponseState({ claimId: CLAIM, spaceId: SPACE, row, entity })).result;
}

function rowWith(viewerResponse: DebateClaim['viewer_response']): DebateClaim {
  return {
    claim_entity_id: CLAIM,
    space_id: SPACE,
    response_kind: 'stance',
    viewer_response: viewerResponse,
    viewer_debate_ready: false,
    readiness_disabled_reason: null,
    online_choices: [],
  } as unknown as DebateClaim;
}

/**
 * The guard `EntityVoteButtons` carried and the shared card dropped.
 *
 * An unpublished edit to the claim's *type* puts the draft and the published graph into
 * disagreement about whether the entity is a claim at all — curation and stance are different vote
 * kinds, so responding across that disagreement publishes the wrong kind of vote, not merely a
 * mislabelled one.
 *
 * The "Is factual" value used to be watched here for the same reason, when it chose between a
 * stance and a veracity response. It chooses nothing now, so an unpublished edit to it cannot
 * change what gets published and must not disable the pills.
 */
describe('useClaimResponseState and an unpublished vocabulary edit', () => {
  it('lets someone respond while the factual flag has an unpublished local edit', () => {
    const result = render(
      entityWith([{ spaceId: SPACE, property: { id: CLAIM_IS_FACTUAL }, value: '1', isLocal: true }])
    );

    expect(result.current.responseBlockedReason).toBeNull();
  });

  it('still blocks responding while the Claim type itself has an unpublished local edit', () => {
    const result = render(
      entityWith(
        [],
        [
          {
            spaceId: SPACE,
            type: { id: SystemIds.TYPES_PROPERTY },
            toEntity: { id: CLAIM_TYPE_ID },
            isLocal: true,
          },
        ]
      )
    );

    expect(result.current.responseBlockedReason).toBe('Publish the claim type change before responding.');
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

// GEO-2824. The same rule the hub card applies, so the two cannot drift apart again.
describe('useClaimResponseState and the viewer’s side', () => {
  it('takes geo-chat’s answer where it has one', () => {
    mocks.summary = { indexedViewerDirection: 'positive' };
    const result = render(entityWith(), rowWith({ position: false, position_label: 'Disagree' }));

    expect(result.current.readiness.viewer_response?.position).toBe(false);
  });

  it('falls back to the indexed read where geo-chat has none', () => {
    mocks.summary = { indexedViewerDirection: 'positive' };
    const result = render(entityWith(), rowWith(null));

    expect(result.current.readiness.viewer_response?.position).toBe(true);
  });

  // `viewerDirection` includes the in-flight write, so using it would let the snapshot confirm itself.
  it('never falls back to the viewer’s own in-flight write', () => {
    mocks.summary = { viewerDirection: 'positive', indexedViewerDirection: null };
    const result = render(entityWith(), rowWith(null));

    expect(result.current.readiness.viewer_response).toBeNull();
  });

  // A row that names no side is not an answer yet: pressing a side the viewer already holds would
  // publish it again instead of clearing it.
  it('waits for the indexed read before calling a silent row resolved', () => {
    mocks.summary = { isViewerResponseLoading: true };
    expect(render(entityWith(), rowWith(null)).current.isViewerResponseResolved).toBe(false);
    expect(
      render(entityWith(), rowWith({ position: true, position_label: 'Agree' })).current.isViewerResponseResolved
    ).toBe(true);
  });

  it('substitutes nothing while the indexed read is still in flight', () => {
    mocks.summary = { isViewerResponseLoading: true, indexedViewerDirection: 'positive' };
    const result = render(entityWith(), rowWith(null));

    expect(result.current.readiness.viewer_response).toBeNull();
  });
});
