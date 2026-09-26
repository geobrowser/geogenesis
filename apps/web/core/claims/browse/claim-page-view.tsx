'use client';

import { useQueryClient } from '@tanstack/react-query';

import * as React from 'react';

import cx from 'classnames';
import { usePathname } from 'next/navigation';

import { ClaimCommentPositionProvider } from '~/core/claims/browse/claim-comment-position';
import { ClaimPositionCommentControl } from '~/core/claims/browse/claim-position-comment';
import { TOPICS_PROPERTY_ID } from '~/core/claims/ontology';
import type { DebateClaim } from '~/core/debates/api';
import {
  trustedIndexedPosition,
  useBackfillReadinessForHeldPosition,
} from '~/core/debates/backfill-readiness-for-held-position';
import { useDebateClaims } from '~/core/debates/hooks';
import { useClaimPositionControl } from '~/core/debates/matchmaking/matchmaking-claim-card';
import { usePrivySignIn } from '~/core/hooks/use-privy-sign-in';
import { ID } from '~/core/id';
import { hasRecordToShow } from '~/core/profile/profile-proposer';
import { CLAIM_RESPONSE_KIND } from '~/core/responses/entity-response';
import { useActiveTabIdForEditor } from '~/core/state/editor/editor-provider';
import { useEntitySidePanelActiveTab } from '~/core/state/entity-side-panel-active-tab';
import { useQueryEntity } from '~/core/sync/use-store';
import type { Relation, TabEntity } from '~/core/types';
import { NavUtils } from '~/core/utils/utils';

import { ClampedText } from '~/design-system/clamped-text';
import { Fire } from '~/design-system/icons/fire';
import { PrefetchLink as Link } from '~/design-system/prefetch-link';
import { Skeleton } from '~/design-system/skeleton';
import { Text } from '~/design-system/text';

import { CommentSection } from '~/partials/comments/comments-section';
import { Editor } from '~/partials/editor/editor';
import { EditableHeading } from '~/partials/entity-page/editable-entity-header';
import {
  ENTITY_DESCRIPTION_MAX_LINES,
  EntityPageInlineDescription,
} from '~/partials/entity-page/entity-page-inline-description';
import { EntityTabs } from '~/partials/entity-page/entity-tabs';
import { META_CHIP_CLASS } from '~/partials/entity-page/relation-chip-section';
import { ClaimVerdictColumn } from '~/partials/explore/claim-explore-feed-card';
import { type ActivityKind, ProfileActivitySection } from '~/partials/profile/profile-activity-section';
import { SPACE_TABS_ANCHOR } from '~/partials/space-page/space-tabs-anchor';

import { adjustClaimActivityTotal, useClaimActivityCounts } from './claim-activity-count';
import { ClaimEndSlot } from './claim-end-slot';
import { ClaimRecordTab } from './claim-record-tab';
import { getClaimSources } from './claim-sources';
import { ClaimSourcesTab } from './claim-sources-tab';
import { ClaimTopicsTab } from './claim-topics-tab';
import { useClaimActivityRows } from './use-claim-activity-rows';
import { useClaimRecord } from './use-claim-record';
import { type ClaimResponseState, useClaimResponseState } from './use-claim-response-state';

type ClaimTab = 'overview' | 'debates' | 'claims' | 'topics' | 'sources' | 'custom';
type ClaimSystemTab = Exclude<ClaimTab, 'custom'>;

/**
 * Shared with the cover/avatar header so its left edge stays aligned with the claim column.
 *
 * 840 for 800px of content: the inset below sits inside this width, at 20px a side.
 */
export const CLAIM_PAGE_CONTENT_MAX_WIDTH = 840;
export const CLAIM_PAGE_CONTENT_INSET_CLASS = 'px-4 @[560px]:px-5';

export function resolveClaimTab({
  pathname,
  authoredTabId,
  panel,
}: {
  pathname: string;
  authoredTabId: string | null;
  panel: { activeTabId: string | null; activeSystemTab: string | null } | null;
}): ClaimTab {
  // A side panel owns its navigation. The page behind it may itself be on /debates or carry a
  // custom tab query, and borrowing either would make a newly opened panel start on the wrong tab.
  if (panel) {
    if (panel.activeTabId) return 'custom';
    if (panel.activeSystemTab === 'debates') return 'debates';
    if (panel.activeSystemTab === 'claims') return 'claims';
    if (panel.activeSystemTab === 'topics') return 'topics';
    if (panel.activeSystemTab === 'sources') return 'sources';
    return 'overview';
  }

  if (authoredTabId) return 'custom';
  if (pathname.endsWith('/debates')) return 'debates';
  if (pathname.endsWith('/claims')) return 'claims';
  if (pathname.endsWith('/topics')) return 'topics';
  if (pathname.endsWith('/sources')) return 'sources';
  return 'overview';
}

/**
 * The browse-mode read view for a Claim.
 *
 * One column at every width. The route view, the entity side panel and a phone are three different
 * widths of the same page rather than three layouts — the side panel is narrow on a wide viewport,
 * so a viewport media query would lay it out as though it had the whole screen. What varies with
 * width is spacing, handled through container queries against the wrapper below.
 *
 * Space-scoped throughout. `spaceId` is the space the reader arrived through, and every
 * space-scoped read on the page — the response kind, the counts, geo-chat's claim row, the debates
 * and related claims — is keyed on that one id, so the page can never mix two spaces' data.
 *
 * Modules render only when they have something to say. A claim nobody has responded to, that has
 * never been debated, that carries no topics and was authored by hand shows its text, its space,
 * and the controls to act on it — and nothing else.
 */
export function ClaimPageView({
  entityId,
  spaceId,
  initialTabRelations = [],
  tabEntities = [],
  footer,
  isEditing = false,
}: {
  entityId: string;
  spaceId: string;
  initialTabRelations?: Relation[];
  tabEntities?: TabEntity[];
  footer?: React.ReactNode;
  isEditing?: boolean;
}) {
  const { entity, isLoading } = useQueryEntity({ id: entityId, spaceId });
  const pathname = usePathname();
  const activeAuthoredTabId = useActiveTabIdForEditor();
  const sidePanelTab = useEntitySidePanelActiveTab();

  // Hoisted so one lookup answers for the whole page. geo-chat's row and the graph's `Is factual`
  // are two copies of the same fact and can disagree — while an edit to the flag indexes, most
  // obviously. Deriving the kind twice let the verdict count one vote kind while the pills
  // published another, and a response would then never appear in the number above it: the kind is
  // what selects `voteKind` on both the count query and the write.
  //
  // geo-chat's copy wins where it exists, matching every other claim surface; the graph answers for
  // spaces geo-chat does not index, which have no row at all.
  const rowQuery = useDebateClaims(spaceId, [entityId], true);
  const row: DebateClaim | null = rowQuery.data?.claims.find(claim => claim.claim_entity_id === entityId) ?? null;
  const state = useClaimResponseState({ claimId: entityId, spaceId, row, entity: entity ?? null });
  const { responseKind, summary } = state;
  // Explore's rule for drawing the verdict column at all: counts that answered, and at least one.
  const hasVerdict = !summary.isLoading && summary.hasCounts && summary.total > 0;
  // Whether the hero keeps a second track, which is deliberately not the same question.
  //
  // `hasVerdict` cannot be true until the counts answer, so a grid template derived from it alone
  // painted every claim one-column and then re-wrapped the title the moment the column appeared —
  // a layout shift at the very top of the page, on every load, that the old below-header verdict
  // never had. An answered claim is the common case on this page, so the unknown state reserves
  // the column and only a settled zero takes it away.
  //
  // `hasCounts`, not `isLoading`, is what "settled" means. A counts query that exhausts its
  // retries leaves `total` at zero with nothing loading any more — the shape of an unanswered
  // claim, which is exactly what it is not, and the distinction `hasCounts` exists to draw. Keying
  // off `isLoading` gave the track back on that failure and re-wrapped the title anyway, and would
  // have taken it away again if a later refetch succeeded. Unknown reserves; only a measured zero
  // releases.
  const reserveVerdictColumn = !summary.hasCounts || summary.total > 0;

  const topics = React.useMemo(() => relationsOfType(entity?.relations, TOPICS_PROPERTY_ID), [entity?.relations]);
  const topicIds = React.useMemo(() => topics.map(topic => topic.toEntity.id), [topics]);
  const sources = React.useMemo(() => getClaimSources(entity?.relations ?? []), [entity?.relations]);

  // Whether anything is drawn above the claim. The hero pins its parts to explicit rows so the
  // verdict can start on the title's, and row 1 belongs to this strip — so when nothing fills it,
  // the rows have to move up rather than leave a `gap-y-4` above the claim that belongs to a row
  // nothing occupies. Visible in the side panel and at phone widths, where that gap is set.
  const hasChipsRow = (SHOW_HERO_TOPICS && topics.length > 0) || summary.isControversial;

  const requestedTab = resolveClaimTab({
    pathname,
    authoredTabId: activeAuthoredTabId,
    panel: sidePanelTab,
  });
  const record = useClaimRecord({
    claimId: entityId,
    spaceId,
    topicIds,
  });

  const overviewHref = NavUtils.toEntity(spaceId, entityId);
  const hrefs = {
    debates: `${overviewHref}/debates`,
    claims: `${overviewHref}/claims`,
    topics: `${overviewHref}/topics`,
    sources: `${overviewHref}/sources`,
  };
  // Matches profile record tabs: unknown/error stays reachable, while a settled zero disappears.
  const hasDebates = hasRecordToShow(
    record.debatesLoading || record.debatesError || record.debatesCountUnavailable ? undefined : record.debatesTotal
  );
  const hasClaims = hasRecordToShow(
    record.claimsLoading || record.claimsError || record.claimsCountUnavailable ? undefined : record.claimsTotal
  );
  const hasTopics = topics.length > 0;
  const hasSources = sources.length > 0;
  const systemTabs = [
    { label: 'Overview', href: overviewHref, sidePanelKey: 'overview' },
    ...(hasDebates ? [{ label: 'Debates', href: hrefs.debates, sidePanelKey: 'debates' }] : []),
    ...(hasClaims ? [{ label: 'Related claims', href: hrefs.claims, sidePanelKey: 'claims' }] : []),
    ...(hasTopics ? [{ label: 'Topics', href: hrefs.topics, sidePanelKey: 'topics' }] : []),
    ...(hasSources ? [{ label: 'Sources', href: hrefs.sources, sidePanelKey: 'sources' }] : []),
  ];

  if (isLoading && !entity) {
    return (
      <div className={`flex flex-col gap-4 py-6 ${CLAIM_PAGE_CONTENT_INSET_CLASS}`}>
        <Skeleton className="h-8 w-3/4 rounded" />
        <Skeleton className="h-[132px] w-full rounded-lg" />
        <Skeleton className="h-[96px] w-full rounded-lg" />
      </div>
    );
  }

  if (!entity) return null;

  return (
    <div className="@container">
      <div
        className={`mx-auto flex w-full flex-col gap-6 py-6 @[560px]:gap-8 @[560px]:py-8 ${CLAIM_PAGE_CONTENT_INSET_CLASS}`}
        style={{ maxWidth: CLAIM_PAGE_CONTENT_MAX_WIDTH }}
      >
        {/* The hero and the tabs share a fixed 48px gap rather than the page's, which is 24px below
            560px and 32px above. */}
        <div className="flex flex-col gap-12">
          {/* Hero: the Explore claim card's layout at page scale. Everything you can *do* to the
              claim on the left — what it is, the claim, the pills — and where opinion stands on the
              right, behind a rule that runs the full height. Under `claim-card-narrow` (a 520px
              container) it stacks: the verdict drops below the pills and the rule goes, exactly as
              the card does. `@container` here so that decision is the hero's width, not the page's.

              No verdict, no column: a claim nobody has answered takes the full width, as on Explore. */}
          <header className="@container">
            <div
              className={cx(
                'grid claim-card-narrow:grid-cols-1 claim-card-narrow:gap-y-4',
                reserveVerdictColumn ? 'grid-cols-[minmax(0,1fr)_220px] gap-x-6' : 'grid-cols-1'
              )}
            >
              {/* Above the claim and across both columns: what it is about. Capped, with the rest a
                  tab away rather than a wall of chips over the title. No type or tag chips — every
                  claim on this page is a Claim. Drawn only when there is something to draw, so a claim
                  with neither leaves no empty track behind. */}
              {hasChipsRow ? (
                <ClaimTopicsRow
                  topics={SHOW_HERO_TOPICS ? topics : []}
                  spaceId={spaceId}
                  seeAllHref={hrefs.topics}
                  onSeeAll={sidePanelTab ? () => sidePanelTab.setActiveSystemTab('topics') : undefined}
                  isControversial={summary.isControversial}
                  className="col-span-full row-start-1 mb-3 claim-card-narrow:mb-0"
                />
              ) : null}

              <div
                className={cx('col-start-1 flex min-w-0 flex-col gap-3', hasChipsRow ? 'row-start-2' : 'row-start-1')}
              >
                {/* `text-pretty`, not `text-balance`. Balancing evens every line to the same length,
                    which on a claim — a full sentence running to three or four lines — leaves each one
                    breaking well short of the measure and reads as wrapping early. Pretty only avoids a
                    stranded last word, so the lines fill. */}
                {isEditing ? (
                  <EditableHeading entityId={entityId} spaceId={spaceId} fallbackName={entity.name ?? entity.id} />
                ) : (
                  <h1 className="text-[1.5rem] leading-[1.3] font-semibold tracking-[-0.4px] text-pretty text-text @[560px]:text-[1.75rem]">
                    {entity.name ?? entity.id}
                  </h1>
                )}

                {/* Clamped, like entity pages and the side panel (GEO-2772). What is shared is the line
                    budget, not the cut: wrapping differs with width, so the route, the side panel and a
                    phone break at different words but give up the same three lines of vertical space.
                    `ClampedText` measures an unclamped clone, so the toggle appears only when something
                    is genuinely hidden (GEO-2756). */}
                {isEditing ? (
                  <EntityPageInlineDescription
                    entityId={entityId}
                    spaceId={spaceId}
                    fallbackDescription={entity.description}
                  />
                ) : (
                  entity.description && (
                    <ClampedText
                      text={entity.description}
                      maxLines={ENTITY_DESCRIPTION_MAX_LINES}
                      variant="body"
                      textClassName="wrap-break-word text-grey-04"
                    />
                  )
                )}
              </div>

              <div
                className={cx('col-start-1 mt-4 claim-card-narrow:mt-0', hasChipsRow ? 'row-start-3' : 'row-start-2')}
              >
                <ClaimPositionSection entityId={entityId} spaceId={spaceId} state={state} row={row} />
              </div>

              {/* From the title's row down, so the share lines up with the claim's first line rather
                  than the chips above it; the rule runs beside the claim and the pills. Explore's own
                  column, not a copy of it. */}
              {hasVerdict ? (
                <div
                  className={cx(
                    'col-start-2 row-span-2 border-l border-divider pl-6 claim-card-narrow:col-start-1 claim-card-narrow:row-span-1 claim-card-narrow:border-l-0 claim-card-narrow:pl-0',
                    hasChipsRow
                      ? 'row-start-2 claim-card-narrow:row-start-4'
                      : 'row-start-1 claim-card-narrow:row-start-3'
                  )}
                >
                  <ClaimVerdictColumn
                    entityId={entityId}
                    spaceId={spaceId}
                    responseKind={responseKind}
                    summary={summary}
                    matchDebatePanelOnMobile={false}
                  />
                </div>
              ) : null}
            </div>
          </header>

          <div id={sidePanelTab ? undefined : SPACE_TABS_ANCHOR}>
            <EntityTabs
              entityId={entityId}
              spaceId={spaceId}
              initialTabRelations={initialTabRelations}
              tabEntities={tabEntities}
              systemTabsBefore={systemTabs}
              reservedSystemLabels={systemTabs.map(tab => tab.label)}
              divideBeforeAuthored
            />
          </div>
        </div>

        <ClaimTabPanel
          activeTab={requestedTab}
          entityId={entityId}
          spaceId={spaceId}
          claimName={entity.name ?? null}
          entityRelations={entity.relations}
          responseKind={responseKind}
          summary={summary}
          record={record}
          topics={topics}
          availableSpaceIds={entity.spaces}
          hrefs={{ debates: hrefs.debates, claims: hrefs.claims }}
          onSelectSystemTab={sidePanelTab?.setActiveSystemTab}
        />
        {footer}
      </div>
    </div>
  );
}

function ClaimTabPanel({
  activeTab,
  entityId,
  spaceId,
  claimName,
  entityRelations,
  responseKind,
  summary,
  record,
  topics,
  availableSpaceIds,
  hrefs,
  onSelectSystemTab,
}: {
  activeTab: ClaimTab;
  entityId: string;
  spaceId: string;
  /** Passed down to the thread, where every side badge names the claim it is about. */
  claimName: string | null;
  entityRelations: Relation[];
  responseKind: ClaimResponseState['responseKind'];
  summary: ClaimResponseState['summary'];
  record: ReturnType<typeof useClaimRecord>;
  topics: Relation[];
  availableSpaceIds: string[];
  hrefs: { debates: string; claims: string };
  onSelectSystemTab?: (tab: ClaimSystemTab) => void;
}) {
  if (activeTab === 'custom') return <Editor spaceId={spaceId} shouldHandleOwnSpacing />;

  if (activeTab === 'debates') {
    return (
      <ClaimRecordTab
        kind="debates"
        claimId={entityId}
        spaceId={spaceId}
        availableSpaceIds={availableSpaceIds}
        sourceTopics={topics.map(topic => ({ id: topic.toEntity.id, name: topic.toEntity.name }))}
      />
    );
  }

  if (activeTab === 'claims') {
    return (
      <ClaimRecordTab
        kind="claims"
        claimId={entityId}
        spaceId={spaceId}
        availableSpaceIds={availableSpaceIds}
        sourceTopics={topics.map(topic => ({ id: topic.toEntity.id, name: topic.toEntity.name }))}
      />
    );
  }

  if (activeTab === 'topics') {
    // Every topic, uncapped, as explore cards: this tab is where the hero's "See all" leads, and a
    // list somebody was sent to is a list worth ordering and describing rather than a row of chips.
    return <ClaimTopicsTab topics={topics} spaceId={spaceId} />;
  }

  if (activeTab === 'sources') {
    return <ClaimSourcesTab claimId={entityId} claimRelations={entityRelations} spaceId={spaceId} />;
  }

  return (
    <ClaimOverviewTab
      entityId={entityId}
      spaceId={spaceId}
      claimName={claimName}
      responseKind={responseKind}
      summary={summary}
      record={record}
      hrefs={hrefs}
      onSelectSystemTab={onSelectSystemTab}
    />
  );
}

/**
 * The claim's overview: the related-claims gallery, then everything that has happened to it.
 *
 * Debates appear twice on purpose, and this comment used to say the opposite. An earlier cut did
 * remove the gallery — a debate belongs in the account of what happened to this claim rather than in
 * a shelf above it — and it went back in because the two are not the same offer: the gallery is the
 * way through to the Debates tab, the complete filterable index, while the thread shows the few most
 * recent in the order they happened, in among the comments. Two jobs. If that stops being true, the
 * gallery is the one to drop.
 *
 * Its own component because the panel above returns early for every other tab, and a hook cannot
 * live behind an early return.
 */
function ClaimOverviewTab({
  entityId,
  spaceId,
  claimName,
  responseKind,
  summary,
  record,
  hrefs,
  onSelectSystemTab,
}: {
  entityId: string;
  spaceId: string;
  /** For the hover title on every commenter's side badge — see `ClaimCommentPositionProvider`. */
  claimName: string | null;
  responseKind: ClaimResponseState['responseKind'];
  summary: ClaimResponseState['summary'];
  record: ReturnType<typeof useClaimRecord>;
  hrefs: { debates: string; claims: string };
  onSelectSystemTab?: (tab: ClaimSystemTab) => void;
}) {
  // The claim's own vocabulary carries into the thread: a debater's side reads Agree/Disagree on
  // an opinion claim and Verify/Dispute on a factual one, the same as every commenter's badge.
  // The same number the claim's card shows in Explore, from the same query — one definition of
  // "how much has happened here", so the two surfaces cannot disagree.
  const activityCounts = useClaimActivityCounts(React.useMemo(() => [entityId], [entityId]));
  const activityTotal = activityCounts.get(ID.uuidToHex(entityId))?.total;

  // The thread can add to that number but cannot compute it, so the page that owns the aggregate
  // owns the adjustment too. It lands in the query cache rather than in the section's state, which
  // is what makes it survive the section remounting and stay behind when the reader walks to the
  // next claim — see `adjustClaimActivityTotal`.
  const queryClient = useQueryClient();
  const adjustActivityTotal = React.useCallback(
    (delta: number) => adjustClaimActivityTotal(queryClient, entityId, delta),
    [entityId, queryClient]
  );

  const activity = useClaimActivityRows({
    claimId: entityId,
    spaceId,
    responseVocabulary: responseKind === 'veracity' ? 'veracity' : 'stance',
  });

  const kinds: ActivityKind[] = [
    {
      // Still here as well as in the thread below. The gallery is the way through to the Debates
      // tab — the complete, filterable index — where the thread shows the few most recent in the
      // order they happened. Two jobs, not two copies.
      key: 'debates',
      label: 'Debates',
      rows: record.debateRows,
      total: record.debatesTotal,
      isLoading: record.debatesLoading,
      isError: record.debatesError,
      isCountUnavailable: record.debatesCountUnavailable,
      href: hrefs.debates,
      seeAllLabel: 'View all debates',
      onSeeAll: onSelectSystemTab ? () => onSelectSystemTab('debates') : undefined,
    },
    {
      key: 'claims',
      label: 'Claims',
      rows: record.claimRows,
      total: record.claimsTotal,
      isLoading: record.claimsLoading,
      isError: record.claimsError,
      isCountUnavailable: record.claimsCountUnavailable,
      href: hrefs.claims,
      seeAllLabel: 'View all claims',
      onSeeAll: onSelectSystemTab ? () => onSelectSystemTab('claims') : undefined,
    },
  ];

  return (
    <>
      {/*
       * Keyed, because the route does not remount this page between records.
       *
       * `default-entity-page` renders `EntityPageBody` unkeyed, so following a related claim reuses
       * this component — and the card's selection would come with it, landing a claim that has
       * debates on the Claims left over from one that had none. That is GEO-3021 again, reached by
       * walking rather than by loading.
       *
       * On the space as well as the claim, because a claim is not one record. It can live in
       * several spaces — `SpaceRedirect` sends a reader on only where the entity is *absent* from
       * the one they asked for — and everything the card is fed here is read through `spaceId`
       * alone, so the same claim in two spaces is two different sets of debates and claims under
       * one entity id. Keying on the entity would have carried a selection across that, which is
       * the same leak one step further out. `EntitySidePanelBody` keys on both for this reason.
       *
       * Keyed here rather than by giving the card an `entityId` prop, because the card takes a list
       * of kinds and knows nothing about whose they are — which is what lets a space and a person
       * share it.
       */}
      <ProfileActivitySection key={`${spaceId}:${entityId}`} kinds={kinds} />
      {/* Last, like the ordinary entity page. An empty thread is an invitation, not absence. */}
      <ClaimCommentPositionProvider
        entityId={entityId}
        spaceId={spaceId}
        responseKind={responseKind}
        // Which claim an Agree or a Disagree is about. By the time a reader is this far down the page
        // the title above it is out of sight, and a badge on a comment under an extracted claim is
        // answering for a different claim than the one the page is about — so each badge names its own.
        claimName={claimName}
        viewerDirection={summary.viewerDirection}
        viewerSpaceId={summary.viewerSpaceId}
        isViewerResponseLoading={summary.isViewerResponseLoading}
      >
        {/* "Activity", because the list now holds debates as well as comments — and the count says
            how much has happened to this claim rather than how many people typed. */}
        <CommentSection
          entityId={entityId}
          spaceId={spaceId}
          targetEntityType="claim"
          title="Activity"
          activityRows={activity.rows}
          totalOverride={activityTotal}
          onActivityPublish={adjustActivityTotal}
          // Best rather than most-recent: this list is the record of an argument, not a running
          // conversation, and the thing worth reading first is what the thread rates highest.
          defaultSortOrder="best"
        />
      </ClaimCommentPositionProvider>
    </>
  );
}

/**
 * Taking a side, and being offered a debate on it.
 *
 * Both live together under the claim in the hero: the side pills first, then the debate offer
 * directly beneath them. They belong together because they are a sequence — the offer exists only
 * because of the side above it, and reading it beside the title asked the reader to connect two
 * things a screen apart. The offer's own comment below says the same about where it sits.
 *
 * There is no readiness switch and no header here. The hub's claim card puts a switch in its
 * header's top right; this section is not that card, and an earlier version of this note described
 * that arrangement instead of this one.
 *
 * The pills and the publishing behind them come from the hub's own control, so a response taken
 * here goes through exactly the path a response taken in the panel does — including the optimistic
 * handling that keeps a just-published side from looking like it was discarded.
 */
function ClaimPositionSection({
  entityId,
  spaceId,
  state,
  row,
}: {
  entityId: string;
  spaceId: string;
  /**
   * The page's one derivation, passed down rather than repeated.
   *
   * Deriving a second kind here is what let the page count one vote kind while publishing another,
   * and the same block written per surface is what made each of that family of bugs a separate fix.
   */
  state: ClaimResponseState;
  /** geo-chat's row, or null — which for a claim nobody has answered is a settled answer. */
  row: DebateClaim | null;
}) {
  const { claim, positions, readiness, isResponseKindResolved, isViewerResponseResolved, responseBlockedReason } =
    state;

  // A signed-out visitor gets the sign-in prompt rather than two dead pills, the same way the vote
  // arrows on an entity page do — and through the same hook, which also keeps Privy's session
  // restoration from being mistaken for a login somebody asked for.
  const promptSignIn = usePrivySignIn();
  const control = useClaimPositionControl({
    claim,
    positions,
    readiness,
    answersReady: isResponseKindResolved && isViewerResponseResolved,
    responseBlockedReason,
    onRequireSignIn: promptSignIn,
  });
  const indexedPosition = trustedIndexedPosition(state.summary, control.isResponsePending);
  useBackfillReadinessForHeldPosition({ readiness: row, entityId, spaceId, indexedPosition });

  return (
    // No card of its own: it renders in the hero's left column, under the claim.
    <section aria-label="Your position">
      <ClaimPositionCommentControl
        entityId={entityId}
        spaceId={spaceId}
        positions={control.optimisticPositions}
        responseKind={CLAIM_RESPONSE_KIND}
        viewerPosition={control.viewerPosition}
        onRespond={control.respond}
        promptForComment={control.isConnected}
        disabled={!control.canRespond}
        pending={control.isResponsePending}
        titleFor={control.actionTitle}
        // Explore's pill row width, so the two read as one control.
        positionRowClassName="max-w-[360px]"
      />
      {control.responseError ? (
        <div role="alert" className="mt-2">
          <Text as="p" variant="footnote" color="red-01">
            {control.responseError}
          </Text>
        </div>
      ) : null}
      {/* Under the pills rather than up in the hero.
       *
       * On a card the offer ends the meta row because the card has no better place for it. A page
       * does: taking a side and being offered a debate on it are one sequence, and the offer only
       * exists because of the side directly above it. Reading it beside the title asked the reader
       * to connect two things a screen apart. */}
      <ClaimEndSlot
        claimId={entityId}
        spaceId={spaceId}
        activeDebate={row?.active_debate}
        variant="block"
        // The offer rests on the side set by the pills directly above it, so it moves when they do.
        // `undefined` while the reads are out, so "not known yet" cannot read as "holds none".
        viewerPosition={isResponseKindResolved && isViewerResponseResolved ? control.viewerPosition : undefined}
        indexedViewerPosition={indexedPosition}
        className="mt-2"
      />
    </section>
  );
}

/**
 * Whether the hero shows the claim's topics above it. Off for now: the Topics tab holds them, and the
 * hero keeps only Controversial. Turning this back on restores the capped row and its "See all".
 */
const SHOW_HERO_TOPICS = false;

/** How many topics the hero shows before "See all" hands over to the Topics tab. */
const HERO_TOPICS_LIMIT = 5;

/**
 * The claim's topics above it, across the hero: the first few as links, and "See all" to the Topics
 * tab when there are more. Controversial leads the row when it applies.
 *
 * "See all" is a link to the tab's route on the page, and switches the panel's own tab in the side
 * panel — the panel owns its navigation, so a link there would move the page behind it instead.
 */
function ClaimTopicsRow({
  topics,
  spaceId,
  seeAllHref,
  onSeeAll,
  isControversial,
  className,
}: {
  topics: Relation[];
  spaceId: string;
  seeAllHref: string;
  onSeeAll?: () => void;
  isControversial: boolean;
  className?: string;
}) {
  const seeAllClass = `${META_CHIP_CLASS} text-grey-04 transition-colors hover:border-text hover:text-text`;
  const rowClass = cx('flex min-w-0 flex-wrap items-center gap-1.5', className);

  const chips = (
    <>
      {/* First in the row: "contested" is a fact about the claim rather than one of its topics. The
          chips' own shape and type — `META_CHIP_CLASS`, spelled out because its border and fill are
          the parts that change — in the tag's red, so it reads as one of the row's labels and still
          stands out from them. */}
      {isControversial ? (
        <span className="flex h-6 max-w-full items-center gap-1 rounded border border-red-03 bg-red-02 px-1.5 text-metadata whitespace-nowrap text-red-01">
          <Fire />
          Controversial
        </span>
      ) : null}
      {topics.slice(0, HERO_TOPICS_LIMIT).map(topic => (
        <Link
          key={topic.id}
          href={NavUtils.toEntity(spaceId, topic.toEntity.id)}
          className={`${META_CHIP_CLASS} text-text transition-colors hover:border-text`}
        >
          <span className="truncate">{topic.toEntity.name ?? topic.toEntity.id}</span>
        </Link>
      ))}
      {topics.length > HERO_TOPICS_LIMIT ? (
        onSeeAll ? (
          <button type="button" onClick={onSeeAll} className={seeAllClass}>
            See all
          </button>
        ) : (
          <Link href={seeAllHref} className={seeAllClass}>
            See all
          </Link>
        )
      ) : null}
    </>
  );

  // A navigation landmark has to contain navigation. With `SHOW_HERO_TOPICS` off, the only thing
  // that puts this row on the page is a claim being controversial — and that row holds one status
  // chip and no links, so naming it "Topics" announced an empty region under a heading that
  // describes something else entirely to anyone moving through the page by landmark.
  if (topics.length === 0) {
    return <div className={rowClass}>{chips}</div>;
  }

  return (
    <nav aria-label="Topics" className={rowClass}>
      {chips}
    </nav>
  );
}

function relationsOfType(relations: Relation[] | undefined, propertyId: string): Relation[] {
  return (relations ?? []).filter(relation => relation.isDeleted !== true && ID.equals(relation.type.id, propertyId));
}
