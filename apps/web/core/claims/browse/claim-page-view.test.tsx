import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';

import type React from 'react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { TOPICS_PROPERTY_ID } from '~/core/claims/ontology';
import { TAG_PROPERTY_ID } from '~/core/constants';
import { SOURCES_PROPERTY_ID } from '~/core/debates/ontology';

import { ClaimPageView, resolveClaimTab } from './claim-page-view';

const mocks = vi.hoisted(() => ({
  entity: null as Record<string, unknown> | null,
  /** Props the description's clamp received, or null if it rendered no clamp at all. */
  clamp: null as Record<string, unknown> | null,
  /** Props the chip section received, or null if the page rendered none. */
  chipSection: null as Record<string, unknown> | null,
  tabs: null as Record<string, unknown> | null,
  activity: null as Record<string, unknown> | null,
  recordTab: null as Record<string, unknown> | null,
  sidePanel: null as {
    activeTabId: string | null;
    activeSystemTab: string | null;
    setActiveSystemTab: ReturnType<typeof vi.fn>;
  } | null,
  record: {
    relatedClaimIds: [],
    claimRows: [],
    debateRows: [],
    claimsTotal: 0,
    debatesTotal: 0,
    claimsLoading: false,
    debatesLoading: false,
    claimsError: false,
    debatesError: false,
    claimsCountUnavailable: false,
    debatesCountUnavailable: false,
    claimsFetchingNextPage: false,
    debatesFetchingNextPage: false,
    claimsHasNextPage: false,
    debatesHasNextPage: false,
    fetchNextClaimsPage: () => {},
    fetchNextDebatesPage: () => {},
  },
  /** Claim response context supplied to the otherwise generic comment thread. */
  commentPosition: null as Record<string, unknown> | null,
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

vi.mock('next/navigation', () => ({
  usePathname: () => '/space/space-1/claim-1',
}));
vi.mock('~/core/state/editor/editor-provider', () => ({ useActiveTabIdForEditor: () => null }));

vi.mock('~/partials/entity-page/entity-page-inline-description', () => ({
  ENTITY_DESCRIPTION_MAX_LINES: mocks.maxLines,
  EntityPageInlineDescription: () => <div data-testid="editable-description" />,
}));
vi.mock('~/partials/entity-page/editable-entity-header', () => ({
  EditableHeading: () => <div data-testid="editable-heading" />,
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
    summary: {
      isControversial: false,
      viewerDirection: 'positive',
      viewerSpaceId: 'viewer-space',
      isViewerResponseLoading: true,
    },
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
  useClaimPositionControl: () => ({
    optimisticPositions: [],
    viewerPosition: null,
    respond: () => {},
    canRespond: false,
    actionTitle: () => undefined,
    responseError: null,
    isConnected: false,
  }),
}));
vi.mock('./claim-position-comment', () => ({
  ClaimPositionCommentControl: () => <div data-testid="position" />,
}));
vi.mock('./claim-comment-position', () => ({
  ClaimCommentPositionProvider: (props: Record<string, unknown>) => {
    mocks.commentPosition = props;
    return <>{props.children as React.ReactNode}</>;
  },
}));
vi.mock('~/core/hooks/use-privy-sign-in', () => ({ usePrivySignIn: () => () => {} }));
vi.mock('~/core/debates/backfill-readiness-for-held-position', () => ({
  useBackfillReadinessForHeldPosition: () => {},
}));
vi.mock('./claim-verdict', () => ({ ClaimVerdict: () => <div data-testid="verdict" /> }));
vi.mock('./claim-sources-tab', () => ({ ClaimSourcesTab: () => <div data-testid="sources" /> }));
vi.mock('./claim-end-slot', () => ({ ClaimEndSlot: () => null }));
vi.mock('./claim-record-tab', () => ({
  ClaimRecordTab: (props: Record<string, unknown>) => {
    mocks.recordTab = props;
    return <div data-testid="record-tab" />;
  },
}));
vi.mock('./claim-summary', () => ({ ControversialTag: () => null }));
vi.mock('./use-claim-record', () => ({
  useClaimRecord: () => mocks.record,
}));
vi.mock('~/core/state/entity-side-panel-active-tab', () => ({
  useEntitySidePanelActiveTab: () => mocks.sidePanel,
}));
vi.mock('~/partials/entity-page/entity-tabs', () => ({
  EntityTabs: (props: Record<string, unknown>) => {
    mocks.tabs = props;
    return <div data-testid="tabs" />;
  },
}));
vi.mock('~/partials/profile/profile-activity-section', () => ({
  ProfileActivitySection: (props: Record<string, unknown>) => {
    mocks.activity = props;
    return <div data-testid="activity" />;
  },
}));
vi.mock('~/partials/editor/editor', () => ({ Editor: () => <div data-testid="editor" /> }));
vi.mock('~/partials/comments/comments-section', () => ({
  CommentSection: () => <div data-testid="comments" />,
}));

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
  mocks.tabs = null;
  mocks.activity = null;
  mocks.recordTab = null;
  mocks.sidePanel = null;
  mocks.record.claimsTotal = 0;
  mocks.record.claimsLoading = false;
  mocks.record.claimsError = false;
  mocks.record.claimsCountUnavailable = false;
  mocks.record.claimsFetchingNextPage = false;
  mocks.record.claimsHasNextPage = false;
  mocks.record.fetchNextClaimsPage = () => {};
  mocks.record.debatesTotal = 0;
  mocks.record.debatesLoading = false;
  mocks.record.debatesError = false;
  mocks.record.debatesCountUnavailable = false;
  mocks.record.debatesFetchingNextPage = false;
  mocks.record.debatesHasNextPage = false;
  mocks.record.fetchNextDebatesPage = () => {};
  mocks.commentPosition = null;
});

describe('ClaimPageView record', () => {
  it('offers product tabs before authored claim tabs', () => {
    mocks.record.claimsTotal = 1;

    render(<ClaimPageView entityId="claim-1" spaceId="space-1" />);

    expect(mocks.tabs).toMatchObject({
      reservedSystemLabels: ['Overview', 'Related claims'],
      divideBeforeAuthored: true,
    });
    expect(mocks.tabs?.systemTabsBefore).toEqual([
      expect.objectContaining({ label: 'Overview', sidePanelKey: 'overview' }),
      expect.objectContaining({ label: 'Related claims', sidePanelKey: 'claims' }),
    ]);
  });

  it('exposes the shared tabs anchor on routes but not inside side panels', () => {
    const route = render(<ClaimPageView entityId="claim-1" spaceId="space-1" />);

    expect(document.getElementById('space-tabs')).toContainElement(screen.getByTestId('tabs'));

    route.unmount();
    mocks.sidePanel = { activeTabId: null, activeSystemTab: null, setActiveSystemTab: vi.fn() };
    render(<ClaimPageView entityId="claim-1" spaceId="space-1" />);

    expect(document.getElementById('space-tabs')).not.toBeInTheDocument();
  });

  it('hides empty system tabs and shows them once they have content', () => {
    render(<ClaimPageView entityId="claim-1" spaceId="space-1" />);

    expect((mocks.tabs?.systemTabsBefore as Array<{ label: string }>).map(tab => tab.label)).toEqual(['Overview']);
    expect(mocks.tabs?.reservedSystemLabels).toEqual(['Overview']);

    cleanup();
    mocks.record.claimsTotal = 1;
    mocks.record.debatesTotal = 1;
    mocks.entity = {
      ...claimEntity('Anything'),
      relations: [{ id: 'source-relation', type: { id: SOURCES_PROPERTY_ID }, toEntity: { id: 'source-1' } }],
    };

    render(<ClaimPageView entityId="claim-1" spaceId="space-1" />);

    expect((mocks.tabs?.systemTabsBefore as Array<{ label: string }>).map(tab => tab.label)).toEqual([
      'Overview',
      'Debates',
      'Related claims',
      'Sources',
    ]);
  });

  it('orders Overview as response summary, position, activity, then comments', () => {
    render(<ClaimPageView entityId="claim-1" spaceId="space-1" />);

    const position = screen.getByTestId('position');
    const verdict = screen.getByTestId('verdict');
    const activity = screen.getByTestId('activity');
    const comments = screen.getByTestId('comments');

    expect(verdict.compareDocumentPosition(position) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(position.compareDocumentPosition(activity) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(activity.compareDocumentPosition(comments) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('keeps the claim heading and description editable on the custom surface', () => {
    render(<ClaimPageView entityId="claim-1" spaceId="space-1" isEditing />);

    expect(screen.getByTestId('editable-heading')).toBeInTheDocument();
    expect(screen.getByTestId('editable-description')).toBeInTheDocument();
  });

  it('makes Activity select claim record tabs inside a side panel', () => {
    const setActiveSystemTab = vi.fn();
    mocks.sidePanel = { activeTabId: null, activeSystemTab: null, setActiveSystemTab };

    render(<ClaimPageView entityId="claim-1" spaceId="space-1" />);

    const kinds = mocks.activity?.kinds as Array<{ key: string; onSeeAll?: () => void }>;
    kinds.find(kind => kind.key === 'debates')?.onSeeAll?.();
    kinds.find(kind => kind.key === 'claims')?.onSeeAll?.();

    expect(setActiveSystemTab).toHaveBeenNthCalledWith(1, 'debates');
    expect(setActiveSystemTab).toHaveBeenNthCalledWith(2, 'claims');
  });

  it('marks only failed record counts unavailable in Activity', () => {
    mocks.record.claimsError = true;
    mocks.record.claimsCountUnavailable = true;
    mocks.record.debatesError = true;
    mocks.record.debatesCountUnavailable = false;

    render(<ClaimPageView entityId="claim-1" spaceId="space-1" />);

    const kinds = mocks.activity?.kinds as Array<{ key: string; isCountUnavailable?: boolean }>;
    expect(kinds.find(kind => kind.key === 'claims')?.isCountUnavailable).toBe(true);
    expect(kinds.find(kind => kind.key === 'debates')?.isCountUnavailable).toBe(false);
  });

  it('hands the full side-panel tab the claim record scope', () => {
    mocks.sidePanel = { activeTabId: null, activeSystemTab: 'claims', setActiveSystemTab: vi.fn() };

    render(<ClaimPageView entityId="claim-1" spaceId="space-1" />);

    expect(mocks.recordTab).toMatchObject({
      kind: 'claims',
      claimId: 'claim-1',
      spaceId: 'space-1',
    });
  });
});

describe('resolveClaimTab', () => {
  it('does not borrow the underlying route or authored query for a side panel', () => {
    expect(
      resolveClaimTab({
        pathname: '/space/space-1/claim-1/debates',
        authoredTabId: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        panel: { activeTabId: null, activeSystemTab: null },
      })
    ).toBe('overview');
  });

  it('uses the panel selection when one is present', () => {
    expect(
      resolveClaimTab({
        pathname: '/space/space-1/claim-1',
        authoredTabId: null,
        panel: { activeTabId: null, activeSystemTab: 'sources' },
      })
    ).toBe('sources');
  });
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

describe('ClaimPageView comments', () => {
  it('labels commenters using this claim’s response kind and optimistic viewer position', () => {
    render(<ClaimPageView entityId="claim-1" spaceId="space-1" />);

    expect(mocks.commentPosition).toMatchObject({
      entityId: 'claim-1',
      spaceId: 'space-1',
      responseKind: 'stance',
      viewerDirection: 'positive',
      viewerSpaceId: 'viewer-space',
      isViewerResponseLoading: true,
    });
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
    expect(screen.getByTestId('activity').nextElementSibling).toBe(screen.getByTestId('chip-section'));
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
