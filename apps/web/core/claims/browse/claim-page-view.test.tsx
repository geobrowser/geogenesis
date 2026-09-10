import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';

import type React from 'react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { TOPICS_PROPERTY_ID } from '~/core/claims/ontology';
import { TAG_PROPERTY_ID } from '~/core/constants';

import { ClaimPageView } from './claim-page-view';

const mocks = vi.hoisted(() => ({
  entity: null as Record<string, unknown> | null,
  /** Props the description's clamp received, or null if it rendered no clamp at all. */
  clamp: null as Record<string, unknown> | null,
  /** Props the chip section received, or null if the page rendered none. */
  chipSection: null as Record<string, unknown> | null,
  /**
   * Deliberately not 3.
   *
   * Asserting against the real constant proves nothing: its value is 3, so a page that wrote
   * `maxLines={3}` — the duplication the shared constant exists to prevent — would satisfy it just
   * as well. Stubbing the module to a value the page could not have arrived at on its own is what
   * makes the assertion about where the number came from rather than what it happens to be.
   */
  maxLines: 5,
}));

vi.mock('~/partials/entity-page/entity-page-inline-description', () => ({
  ENTITY_DESCRIPTION_MAX_LINES: mocks.maxLines,
}));

// jsdom has no layout, so the real clamp can never measure an overflow. What this file is about is
// that the description is handed to it at all, and with the shared line budget — the measuring
// itself belongs to `ClampedText`.
vi.mock('~/design-system/clamped-text', () => ({
  ClampedText: (props: Record<string, unknown>) => {
    mocks.clamp = props;
    return <p data-testid="clamped-description">{props.text as string}</p>;
  },
}));

// Its own suite covers the chips and the expander; here we only need to see what it was handed.
vi.mock('~/partials/entity-page/relation-chip-section', () => ({
  META_CHIP_CLASS: 'meta-chip',
  RelationChipSection: (props: Record<string, unknown>) => {
    mocks.chipSection = props;
    return <div data-testid="chip-section" data-label={props.label as string} />;
  },
}));

vi.mock('~/core/sync/use-store', () => ({
  useQueryEntity: () => ({ entity: mocks.entity, isLoading: false }),
}));

vi.mock('~/core/debates/hooks', () => ({
  useDebateClaims: () => ({ data: { claims: [] } }),
}));

vi.mock('./use-claim-response-state', () => ({
  useClaimResponseState: () => ({
    responseKind: 'stance',
    summary: { isControversial: false },
    claim: null,
    positions: [],
    readiness: { response_kind: 'stance' },
    isResponseKindResolved: true,
    isViewerResponseResolved: true,
    responseBlockedReason: null,
  }),
}));

// The page's modules each reach for the sync engine, geo-chat or Privy. None of them is what this
// file is asserting, and the hero renders above all of them.
vi.mock('~/core/debates/matchmaking/matchmaking-claim-card', () => ({
  PositionRow: () => null,
  useClaimPositionControl: () => ({
    optimisticPositions: [],
    viewerPosition: null,
    respond: () => {},
    canRespond: false,
    actionTitle: () => undefined,
    responseError: null,
  }),
}));
vi.mock('~/core/hooks/use-privy-sign-in', () => ({ usePrivySignIn: () => () => {} }));
vi.mock('~/core/debates/retire-confirmed-response-indexing', () => ({
  useRetireConfirmedResponseIndexing: () => {},
}));
vi.mock('~/core/debates/backfill-readiness-for-held-position', () => ({
  useBackfillReadinessForHeldPosition: () => {},
}));
vi.mock('./claim-verdict', () => ({ ClaimVerdict: () => null }));
vi.mock('./claim-debates', () => ({ ClaimDebates: () => null }));
vi.mock('./claim-provenance', () => ({ ClaimProvenance: () => null }));
vi.mock('./claim-related-claims', () => ({ ClaimRelatedClaims: () => null }));
vi.mock('./claim-end-slot', () => ({ ClaimEndSlot: () => null }));
vi.mock('./claim-summary', () => ({ ControversialTag: () => null }));
vi.mock('~/partials/comments/comments-section', () => ({ CommentSection: () => null }));

function claimEntity(description: string | null) {
  return {
    id: 'claim-1',
    name: 'Pineapple belongs on pizza',
    description,
    relations: [],
    types: [],
  };
}

beforeEach(() => {
  mocks.entity = claimEntity('A description long enough that the page has something to collapse.');
  mocks.clamp = null;
  mocks.chipSection = null;
});

afterEach(cleanup);

describe('ClaimPageView description', () => {
  // GEO-2772. It used to be a plain paragraph, so a long description pushed the whole page down —
  // worst in the side panel, which renders this same view at a much narrower width.
  it('clamps the description instead of printing it in full', () => {
    render(<ClaimPageView entityId="claim-1" spaceId="space-1" />);

    expect(screen.getByTestId('clamped-description')).toHaveTextContent(
      'A description long enough that the page has something to collapse.'
    );
  });

  // The number lives with the entity-page component and is imported here. Restating `3` on this
  // surface is what would let the two cut at different points after a change to either — so the
  // module is stubbed to a different number, and the page has to follow it.
  it('takes its line budget from the shared constant rather than restating it', () => {
    render(<ClaimPageView entityId="claim-1" spaceId="space-1" />);

    expect(mocks.clamp?.maxLines).toBe(mocks.maxLines);
  });

  it('renders no description block when the claim has none', () => {
    mocks.entity = claimEntity(null);
    render(<ClaimPageView entityId="claim-1" spaceId="space-1" />);

    expect(screen.queryByTestId('clamped-description')).toBeNull();
  });
});

// GEO-2781. Topics used to be a run of chips crammed into the header's meta row, capped at three
// and with a `+N` that only counted. It is now the topic view's Subtopics section, which is the
// same question asked of the reader and so should not be a second thing that merely looks like it.
describe('ClaimPageView topics', () => {
  const topicRelation = {
    id: 'relation-1',
    type: { id: TOPICS_PROPERTY_ID },
    toEntity: { id: 'topic-1', name: 'Ethics' },
  };

  it('draws them with the shared chip section, under the label Topics', () => {
    mocks.entity = { ...claimEntity('Anything'), relations: [topicRelation] };
    render(<ClaimPageView entityId="claim-1" spaceId="space-1" />);

    expect(screen.getByTestId('chip-section')).toHaveAttribute('data-label', 'Topics');
  });

  it('hands the section the topic relations, scoped to the viewing space', () => {
    mocks.entity = { ...claimEntity('Anything'), relations: [topicRelation] };
    render(<ClaimPageView entityId="claim-1" spaceId="space-1" />);

    expect(mocks.chipSection?.relations).toEqual([topicRelation]);
    expect(mocks.chipSection?.spaceId).toBe('space-1');
  });

  // Tags share the header row with the type and are a different relation; only Topics moved.
  it('passes only topic relations, not the tags beside the type', () => {
    const tagRelation = { id: 'relation-2', type: { id: TAG_PROPERTY_ID }, toEntity: { id: 'tag-1', name: 'Draft' } };
    mocks.entity = { ...claimEntity('Anything'), relations: [topicRelation, tagRelation] };
    render(<ClaimPageView entityId="claim-1" spaceId="space-1" />);

    expect(mocks.chipSection?.relations).toEqual([topicRelation]);
  });
});
