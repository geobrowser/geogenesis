'use client';

import * as React from 'react';

import { usePathname } from 'next/navigation';

import { ClaimCommentPositionProvider } from '~/core/claims/browse/claim-comment-position';
import { ClaimPositionCommentControl } from '~/core/claims/browse/claim-position-comment';
import { TOPICS_PROPERTY_ID } from '~/core/claims/ontology';
import { TAG_PROPERTY_ID } from '~/core/constants';
import type { DebateClaim } from '~/core/debates/api';
import { useBackfillReadinessForHeldPosition } from '~/core/debates/backfill-readiness-for-held-position';
import { useDebateClaims } from '~/core/debates/hooks';
import { useClaimPositionControl } from '~/core/debates/matchmaking/matchmaking-claim-card';
import { usePrivySignIn } from '~/core/hooks/use-privy-sign-in';
import { ID } from '~/core/id';
import { hasRecordToShow } from '~/core/profile/profile-proposer';
import { useActiveTabIdForEditor } from '~/core/state/editor/editor-provider';
import { useEntitySidePanelActiveTab } from '~/core/state/entity-side-panel-active-tab';
import { useQueryEntity } from '~/core/sync/use-store';
import type { Relation, TabEntity } from '~/core/types';
import { NavUtils } from '~/core/utils/utils';

import { ClampedText } from '~/design-system/clamped-text';
import { Fire } from '~/design-system/icons/fire';
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
import { META_CHIP_CLASS, RelationChipSection } from '~/partials/entity-page/relation-chip-section';
import { type ActivityKind, ProfileActivitySection } from '~/partials/profile/profile-activity-section';
import { SPACE_TABS_ANCHOR } from '~/partials/space-page/space-tabs-anchor';

import { ClaimEndSlot } from './claim-end-slot';
import { ClaimRecordTab } from './claim-record-tab';
import { getClaimSources } from './claim-sources';
import { ClaimSourcesTab } from './claim-sources-tab';
import { ClaimVerdict } from './claim-verdict';
import { useClaimRecord } from './use-claim-record';
import { type ClaimResponseState, useClaimResponseState } from './use-claim-response-state';

type ClaimTab = 'overview' | 'debates' | 'claims' | 'sources' | 'custom';
type ClaimSystemTab = Exclude<ClaimTab, 'custom'>;

/** Shared with the cover/avatar header so its left edge stays aligned with the claim column. */
export const CLAIM_PAGE_CONTENT_MAX_WIDTH = 720;
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
    if (panel.activeSystemTab === 'sources') return 'sources';
    return 'overview';
  }

  if (authoredTabId) return 'custom';
  if (pathname.endsWith('/debates')) return 'debates';
  if (pathname.endsWith('/claims')) return 'claims';
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

  const topics = React.useMemo(() => relationsOfType(entity?.relations, TOPICS_PROPERTY_ID), [entity?.relations]);
  const tags = React.useMemo(() => relationsOfType(entity?.relations, TAG_PROPERTY_ID), [entity?.relations]);
  const topicIds = React.useMemo(() => topics.map(topic => topic.toEntity.id), [topics]);
  const sources = React.useMemo(() => getClaimSources(entity?.relations ?? []), [entity?.relations]);
  // Named types only: an unnamed one would render as a raw id, which says less than no chip.
  const typeName = entity?.types.find(type => type.name)?.name ?? null;

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
    sources: `${overviewHref}/sources`,
  };
  // Matches profile record tabs: unknown/error stays reachable, while a settled zero disappears.
  const hasDebates = hasRecordToShow(
    record.debatesLoading || record.debatesError || record.debatesCountUnavailable ? undefined : record.debatesTotal
  );
  const hasClaims = hasRecordToShow(
    record.claimsLoading || record.claimsError || record.claimsCountUnavailable ? undefined : record.claimsTotal
  );
  const hasSources = sources.length > 0;
  const systemTabs = [
    { label: 'Overview', href: overviewHref, sidePanelKey: 'overview' },
    ...(hasDebates ? [{ label: 'Debates', href: hrefs.debates, sidePanelKey: 'debates' }] : []),
    ...(hasClaims ? [{ label: 'Related claims', href: hrefs.claims, sidePanelKey: 'claims' }] : []),
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
            560px and 32px above: 48px is the space above the verdict too, so the block sits evenly. */}
        <div className="flex flex-col gap-12">
          {/* Hero */}
          <header className="flex flex-col gap-3">
            {/* `text-pretty`, not `text-balance`. Balancing evens every line to the same length,
              which on a claim — a full sentence running to three or four lines — leaves each one
              breaking well short of the measure and reads as wrapping early. Pretty only avoids a
              stranded last word, so the lines fill. */}
            {isEditing ? (
              <EditableHeading entityId={entityId} spaceId={spaceId} fallbackName={entity.name ?? entity.id} />
            ) : (
              <h1 className="text-entityTitle text-pretty wrap-break-word text-text">{entity.name ?? entity.id}</h1>
            )}

            {/* Clamped, like entity pages and the side panel (GEO-2772). What is shared is the line
              budget, not the cut: wrapping differs with width, so the route, the side panel and a
              phone — three widths of one layout, per the note above — break at different words.
              They give up the same three lines of vertical space, which a character count could
              not do; the same count spends a different number of lines at each width, which is the
              measurement the reader actually feels.

              `ClampedText` measures an unclamped clone, so the toggle appears only when something
              is genuinely hidden, and it is unaffected by the naive-overflow bug GEO-2756 fixed in
              the feed's own title. */}
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

            {/* What this is. Topics — what it is *about* — used to sit opposite these, pushed to the
              right of the same row; they are their own section below now (GEO-2781), so this row
              has one job and no longer has to survive being squeezed from both ends in the side
              panel. */}
            <div className="flex min-w-0 flex-wrap items-center gap-1.5">
              {typeName && <MetaChip>{typeName}</MetaChip>}
              {tags.map(tag => (
                <MetaChip key={tag.id}>{tag.toEntity.name ?? tag.toEntity.id}</MetaChip>
              ))}
              {/* Among the chips that say what this is, which is what "contested" is. The chips' own shape
                  and type — `META_CHIP_CLASS`, spelled out because its border and fill are the parts that
                  change — in the tag's red, so it reads as one of the row's labels and still stands out from them. */}
              {summary.isControversial ? (
                <span className="flex h-6 max-w-full items-center gap-1 rounded border border-red-03 bg-red-02 px-1.5 text-metadata whitespace-nowrap text-red-01">
                  <Fire />
                  Controversial
                </span>
              ) : null}
            </div>

            {/* The verdict and the reader's own side, in the hero with the claim they answer rather
              than under the tabs: they are the page's point, so they don't move when the tab does.
              The position controls sit under the split, so a reader sees where opinion stands and
              adds to it in the same place. */}
            <ClaimVerdict
              entityId={entityId}
              spaceId={spaceId}
              responseKind={responseKind}
              summary={summary}
              // With the header's 12px gap, 48px above the verdict: the same as below it.
              className="mt-9"
            >
              <ClaimPositionSection entityId={entityId} spaceId={spaceId} state={state} row={row} />
            </ClaimVerdict>
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

  if (activeTab === 'sources') {
    return <ClaimSourcesTab claimId={entityId} claimRelations={entityRelations} spaceId={spaceId} />;
  }

  const kinds: ActivityKind[] = [
    {
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
      <ProfileActivitySection kinds={kinds} />
      {/* The topic view's Subtopics, drawing a claim's Topics (GEO-2781) — same question for the
          reader, so the same shared section rather than two implementations. On a claim, Topics
          belong to the Overview's supporting context and follow its Activity record. */}
      <RelationChipSection label="Topics" relations={topics} spaceId={spaceId} />
      {/* Last, like the ordinary entity page. An empty thread is an invitation, not absence. */}
      <ClaimCommentPositionProvider
        entityId={entityId}
        spaceId={spaceId}
        responseKind={responseKind}
        viewerDirection={summary.viewerDirection}
        viewerSpaceId={summary.viewerSpaceId}
        isViewerResponseLoading={summary.isViewerResponseLoading}
      >
        <CommentSection entityId={entityId} spaceId={spaceId} />
      </ClaimCommentPositionProvider>
    </>
  );
}

/**
 * Taking a side, and standing ready to argue it.
 *
 * Both live together, inside the verdict in the hero, with the readiness switch in the header's top right and the side pills
 * beneath — the same arrangement the hub's claim card uses, so the switch is where anyone who has
 * used the panel already looks for it. They belong together because they are a sequence: readiness
 * can only be turned *on* for a claim you have already responded to.
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
  useBackfillReadinessForHeldPosition({ readiness: row, entityId, spaceId });

  return (
    // No card of its own: it renders inside the verdict, under the split.
    <section aria-label="Your position">
      <ClaimPositionCommentControl
        entityId={entityId}
        spaceId={spaceId}
        positions={control.optimisticPositions}
        responseKind={readiness.response_kind}
        viewerPosition={control.viewerPosition}
        onRespond={control.respond}
        promptForComment={control.isConnected}
        disabled={!control.canRespond}
        titleFor={control.actionTitle}
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
        className="mt-2"
      />
    </section>
  );
}

/**
 * The chip a space homepage uses for its types, reused here for the claim's type and its tags —
 * the same shape in both places, since they are the same kind of label.
 *
 * A plain span, and not a component wrapping the class: topics used to be drawn here too and
 * needed to be links with their own hover state, which is why {@link META_CHIP_CLASS} is a string
 * that callers compose rather than an element. Topics now come from `RelationChipSection`, which
 * composes it the same way.
 */
function MetaChip({ children }: { children: React.ReactNode }) {
  return (
    <span className={`${META_CHIP_CLASS} text-text`}>
      <span className="truncate">{children}</span>
    </span>
  );
}

function relationsOfType(relations: Relation[] | undefined, propertyId: string): Relation[] {
  return (relations ?? []).filter(relation => relation.isDeleted !== true && ID.equals(relation.type.id, propertyId));
}
