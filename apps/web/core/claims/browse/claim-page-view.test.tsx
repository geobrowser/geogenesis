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
  /** How many responses the claim has; zero means the hero draws no verdict column. */
  responseTotal: 11,
  /** Whether the response counts are still out, which is what the hero reserves its column for. */
  summaryLoading: false,
  /** Whether the counts actually answered. False after a terminal failure, not just while loading. */
  hasCounts: true,
  /** Drives the one strip that can occupy the hero's first grid row. */
  isControversial: false,
  /** Props the description's clamp received, or null if it rendered no clamp at all. */
  clamp: null as Record<string, unknown> | null,
  /** Props the chip section received, or null if the page rendered none. */
  chipSection: null as Record<string, unknown> | null,
  /** Props the Topics tab received, or null if the page rendered none. */
  topicsTab: null as Record<string, unknown> | null,
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
  /** Whether the viewer's own response is still confirming, per the shared position control. */
  isResponsePending: false,
  /** Props the position pills received. */
  positionControl: null as Record<string, unknown> | null,
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

// Only `META_CHIP_CLASS` is still read from here — the hero's switched-off topics row borrows the
// chips' shape. The section itself no longer renders on this page at all.
vi.mock('~/partials/entity-page/relation-chip-section', () => ({
  META_CHIP_CLASS: 'meta-chip',
  RelationChipSection: (props: Record<string, unknown>) => {
    mocks.chipSection = props;
    return <div data-testid="chip-section" data-label={props.label as string} />;
  },
}));

// The Topics tab is a feed of its own, with its own counts and ordering covered in its own suite.
// Here we only need to see which topics reached it.
vi.mock('./claim-topics-tab', () => ({
  ClaimTopicsTab: (props: Record<string, unknown>) => {
    mocks.topicsTab = props;
    return <div data-testid="topics-tab" />;
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
      isLoading: mocks.summaryLoading,
      hasCounts: mocks.hasCounts,
      total: mocks.responseTotal,
      isControversial: mocks.isControversial,
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
    isResponsePending: mocks.isResponsePending,
  }),
  ResponseConfirmingNote: () => <p data-testid="confirming" />,
}));
vi.mock('./claim-position-comment', () => ({
  ClaimPositionCommentControl: (props: Record<string, unknown>) => {
    mocks.positionControl = props;
    return <div data-testid="position" />;
  },
}));
vi.mock('./claim-comment-position', () => ({
  ClaimCommentPositionProvider: (props: Record<string, unknown>) => {
    mocks.commentPosition = props;
    return <>{props.children as React.ReactNode}</>;
  },
}));
vi.mock('~/core/hooks/use-privy-sign-in', () => ({ usePrivySignIn: () => () => {} }));
// The prefetching link reaches for the sync engine; the topic chips only need to be links.
vi.mock('~/design-system/prefetch-link', () => ({
  PrefetchLink: ({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) => (
    <a href={href} className={className}>
      {children}
    </a>
  ),
}));
vi.mock('~/core/debates/backfill-readiness-for-held-position', () => ({
  trustedIndexedPosition: () => null,
  useBackfillReadinessForHeldPosition: () => {},
}));
vi.mock('~/partials/explore/claim-explore-feed-card', () => ({
  ClaimVerdictColumn: () => <div data-testid="verdict" />,
}));
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
  mocks.responseTotal = 11;
  mocks.summaryLoading = false;
  mocks.hasCounts = true;
  mocks.isControversial = false;
  mocks.entity = claimEntity('A description long enough that the page has something to collapse.');
  mocks.clamp = null;
  mocks.chipSection = null;
  mocks.topicsTab = null;
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
  mocks.isResponsePending = false;
  mocks.positionControl = null;
});

describe('ClaimPageView record', () => {
  /*
   * GEO-3021, reached by walking rather than by loading. The route renders
   * `EntityPageBody` unkeyed, so following a related claim reuses this page — and
   * the activity card keeps the reader's Debates/Claims selection in its own
   * state, so without a key a claim that has debates would land on the Claims left
   * over from one that had none.
   *
   * Asserted on the node rather than through the mock: a remount builds a new DOM
   * element and a re-render keeps the old one, so element identity is the question
   * itself rather than a proxy for it.
   */
  it('remounts the activity card when the page is pointed at another claim', () => {
    const view = render(<ClaimPageView entityId="claim-1" spaceId="space-1" />);
    const first = screen.getByTestId('activity');

    // Re-rendered on the same claim: still the reader's own card, untouched.
    view.rerender(<ClaimPageView entityId="claim-1" spaceId="space-1" />);
    expect(screen.getByTestId('activity')).toBe(first);

    view.rerender(<ClaimPageView entityId="claim-2" spaceId="space-1" />);

    expect(screen.getByTestId('activity')).not.toBe(first);
  });

  /*
   * And the space, because a claim is not one record. It can live in several —
   * `SpaceRedirect` only moves a reader on where the entity is absent from the
   * space they asked for — and every row the card is given here is read through
   * `spaceId`, so the same claim in two spaces is two different records.
   */
  it('remounts the activity card when the same claim is read in another space', () => {
    const view = render(<ClaimPageView entityId="claim-1" spaceId="space-1" />);
    const first = screen.getByTestId('activity');

    view.rerender(<ClaimPageView entityId="claim-1" spaceId="space-2" />);

    expect(screen.getByTestId('activity')).not.toBe(first);
  });

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

  it('heads the page like an Explore claim card: the claim, the pills, then the verdict column', () => {
    mocks.entity = {
      ...mocks.entity,
      types: [{ id: 'claim-type', name: 'Claim' }],
      relations: [{ id: 'relation-1', type: { id: TOPICS_PROPERTY_ID }, toEntity: { id: 'topic-1', name: 'Ethics' } }],
    };
    render(<ClaimPageView entityId="claim-1" spaceId="space-1" />);

    const heading = screen.getByRole('heading', { level: 1 });
    const position = screen.getByTestId('position');
    const verdict = screen.getByTestId('verdict');
    const tabs = screen.getByTestId('tabs');

    // Topics are on their own tab for now, not above the claim.
    expect(screen.queryByRole('navigation', { name: 'Topics' })).toBeNull();
    expect(heading.compareDocumentPosition(position) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(position.compareDocumentPosition(verdict) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(verdict.compareDocumentPosition(tabs) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // No type chip: every claim on this page is a Claim.
    expect(screen.queryByText('Claim')).toBeNull();
  });

  it('draws no verdict column on a claim nobody has answered, as Explore does', () => {
    mocks.responseTotal = 0;
    render(<ClaimPageView entityId="claim-1" spaceId="space-1" />);

    expect(screen.queryByTestId('verdict')).toBeNull();
    expect(screen.getByTestId('position')).toBeInTheDocument();
  });

  it('keeps both hero tracks while the counts are still out', () => {
    // `hasVerdict` cannot be true until they answer, so a template derived from it alone painted
    // one column and then re-wrapped the claim when the second appeared — a shift at the top of
    // the page on every load.
    mocks.summaryLoading = true;
    const { container } = render(<ClaimPageView entityId="claim-1" spaceId="space-1" />);

    const grid = container.querySelector('header > div');
    expect(grid?.className).toContain('grid-cols-[minmax(0,1fr)_220px]');
    // Reserved, not filled: nothing has said what the verdict is yet.
    expect(screen.queryByTestId('verdict')).toBeNull();
  });

  it('keeps the track when the counts fail rather than reading the failure as a zero', () => {
    // A counts query that exhausts its retries leaves `total` at zero with nothing loading any
    // more — the shape of an unanswered claim, which is exactly what it is not. Keying the track
    // off `isLoading` gave it back on that failure and re-wrapped the title anyway.
    mocks.summaryLoading = false;
    mocks.hasCounts = false;
    mocks.responseTotal = 0;
    const { container } = render(<ClaimPageView entityId="claim-1" spaceId="space-1" />);

    expect(container.querySelector('header > div')?.className).toContain('grid-cols-[minmax(0,1fr)_220px]');
    // Reserved, not filled: there is still no verdict to draw.
    expect(screen.queryByTestId('verdict')).toBeNull();
  });

  it('gives the column back once the counts settle on nobody having answered', () => {
    mocks.responseTotal = 0;
    const { container } = render(<ClaimPageView entityId="claim-1" spaceId="space-1" />);

    expect(container.querySelector('header > div')?.className).toContain('grid-cols-1');
  });

  it('leaves no empty row above the claim when nothing is drawn there', () => {
    // The hero pins its parts to explicit rows so the verdict can start on the title's. With the
    // chips row empty, row 1 is a `gap-y-4` above the claim belonging to a row nothing occupies —
    // visible in the side panel and at phone widths, where that gap is set.
    const { container } = render(<ClaimPageView entityId="claim-1" spaceId="space-1" />);

    expect(screen.getByRole('heading', { level: 1 }).closest('div')?.className).toContain('row-start-1');
    expect(container.querySelector('[data-testid="position"]')?.closest('.col-start-1')?.className).toContain(
      'row-start-2'
    );
  });

  it('moves the rows down again when the claim is controversial', () => {
    mocks.isControversial = true;
    render(<ClaimPageView entityId="claim-1" spaceId="space-1" />);

    expect(screen.getByRole('heading', { level: 1 }).closest('div')?.className).toContain('row-start-2');
  });

  it('announces no Topics landmark over a row that is only the Controversial chip', () => {
    // `SHOW_HERO_TOPICS` is off, so being controversial is the only thing that puts this row on
    // the page — and it holds one status chip and no links. A navigation landmark named "Topics"
    // over that is both empty and misnamed to anyone moving through the page by landmark.
    mocks.isControversial = true;
    // With topics on the claim, so this is about the row having no *links* rather than the claim
    // having no topics.
    mocks.entity = {
      ...claimEntity('Anything'),
      relations: [{ id: 'relation-1', type: { id: TOPICS_PROPERTY_ID }, toEntity: { id: 'topic-1', name: 'Ethics' } }],
    };
    render(<ClaimPageView entityId="claim-1" spaceId="space-1" />);

    expect(screen.getByText('Controversial')).toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: 'Topics' })).toBeNull();
  });

  it('orders Overview as activity, then comments', () => {
    render(<ClaimPageView entityId="claim-1" spaceId="space-1" />);

    const tabs = screen.getByTestId('tabs');
    const activity = screen.getByTestId('activity');
    const comments = screen.getByTestId('comments');

    expect(tabs.compareDocumentPosition(activity) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
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

describe('ClaimPageView position', () => {
  // The claim page is where a confirming response was pressed again and published a retraction:
  // it drew no sign of the wait, so a held pill looked like a settled one.
  it('says the response is confirming, and marks the pills pending, while it is', () => {
    mocks.isResponsePending = true;
    render(<ClaimPageView entityId="claim-1" spaceId="space-1" />);

    expect(screen.getByTestId('confirming')).toBeInTheDocument();
    expect(mocks.positionControl?.pending).toBe(true);
  });

  it('says nothing once it has landed', () => {
    render(<ClaimPageView entityId="claim-1" spaceId="space-1" />);

    expect(screen.queryByTestId('confirming')).toBeNull();
    expect(mocks.positionControl?.pending).toBe(false);
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

// Topics live on their own tab for now; the hero's row is switched off (`SHOW_HERO_TOPICS`). The
// Overview no longer repeats them either.
describe('ClaimPageView topics', () => {
  const topic = (n: number) => ({
    id: `relation-${n}`,
    type: { id: TOPICS_PROPERTY_ID },
    toEntity: { id: `topic-${n}`, name: `Topic ${n}` },
  });
  const tagRelation = { id: 'relation-tag', type: { id: TAG_PROPERTY_ID }, toEntity: { id: 'tag-1', name: 'Draft' } };

  it('draws every topic, and only topics, on the Topics tab', () => {
    mocks.sidePanel = { activeTabId: null, activeSystemTab: 'topics', setActiveSystemTab: vi.fn() };
    mocks.entity = { ...claimEntity('Anything'), relations: [topic(1), topic(2), tagRelation] };
    render(<ClaimPageView entityId="claim-1" spaceId="space-1" />);

    expect(screen.getByTestId('topics-tab')).toBeInTheDocument();
    expect(mocks.topicsTab?.topics).toEqual([topic(1), topic(2)]);
    expect(mocks.topicsTab?.spaceId).toBe('space-1');
  });

  it('no longer draws them as chips anywhere on the page', () => {
    mocks.sidePanel = { activeTabId: null, activeSystemTab: 'topics', setActiveSystemTab: vi.fn() };
    mocks.entity = { ...claimEntity('Anything'), relations: [topic(1)] };
    render(<ClaimPageView entityId="claim-1" spaceId="space-1" />);

    expect(screen.queryByTestId('chip-section')).toBeNull();
  });

  it('no longer repeats them on the Overview', () => {
    mocks.entity = { ...claimEntity('Anything'), relations: [topic(1)] };
    render(<ClaimPageView entityId="claim-1" spaceId="space-1" />);

    expect(screen.queryByTestId('chip-section')).toBeNull();
    expect(screen.queryByTestId('topics-tab')).toBeNull();
  });

  it('offers a Topics tab only when the claim has topics', () => {
    mocks.entity = { ...claimEntity('Anything'), relations: [topic(1)] };
    render(<ClaimPageView entityId="claim-1" spaceId="space-1" />);

    expect((mocks.tabs?.systemTabsBefore as Array<{ label: string }>).map(tab => tab.label)).toContain('Topics');
  });
});
