'use client';

import * as React from 'react';

import { usePathname, useSearchParams } from 'next/navigation';

import { TOPICS_PROPERTY_ID } from '~/core/claims/ontology';
import { TAG_PROPERTY_ID } from '~/core/constants';
import type { DebateClaim } from '~/core/debates/api';
import { useBackfillReadinessForHeldPosition } from '~/core/debates/backfill-readiness-for-held-position';
import { useDebateClaims } from '~/core/debates/hooks';
import { PositionRow, useClaimPositionControl } from '~/core/debates/matchmaking/matchmaking-claim-card';
import { usePrivySignIn } from '~/core/hooks/use-privy-sign-in';
import { ID } from '~/core/id';
import { useEntitySidePanelActiveTab } from '~/core/state/entity-side-panel-active-tab';
import { useQueryEntity } from '~/core/sync/use-store';
import type { Relation, TabEntity } from '~/core/types';
import { NavUtils } from '~/core/utils/utils';

import { ClampedText } from '~/design-system/clamped-text';
import { Skeleton } from '~/design-system/skeleton';
import { Text } from '~/design-system/text';

import { CommentSection } from '~/partials/comments/comments-section';
import { Editor } from '~/partials/editor/editor';
import { ENTITY_DESCRIPTION_MAX_LINES } from '~/partials/entity-page/entity-page-inline-description';
import { EntityTabs } from '~/partials/entity-page/entity-tabs';
import { META_CHIP_CLASS, RelationChipSection } from '~/partials/entity-page/relation-chip-section';
import { SectionTitle } from '~/partials/entity-page/section-title';
import { PersonRecordFeed } from '~/partials/profile/person-record-feed';
import { type ActivityKind, ProfileActivitySection } from '~/partials/profile/profile-activity-section';

import { ClaimEndSlot } from './claim-end-slot';
import { ClaimSourcesTab } from './claim-sources-tab';
import { ControversialTag } from './claim-summary';
import { ClaimVerdict } from './claim-verdict';
import { useClaimRecord } from './use-claim-record';
import { type ClaimResponseState, useClaimResponseState } from './use-claim-response-state';

type ClaimTab = 'overview' | 'debates' | 'claims' | 'sources' | 'custom';

const SYSTEM_TAB_LABELS = ['Overview', 'Debates', 'Claims', 'Sources'];

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
}: {
  entityId: string;
  spaceId: string;
  initialTabRelations?: Relation[];
  tabEntities?: TabEntity[];
}) {
  const { entity, isLoading } = useQueryEntity({ id: entityId, spaceId });
  const pathname = usePathname();
  const searchParams = useSearchParams();
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
  // Named types only: an unnamed one would render as a raw id, which says less than no chip.
  const typeName = entity?.types.find(type => type.name)?.name ?? null;
  const record = useClaimRecord({ claimId: entityId, spaceId, topicIds });

  const activeTab: ClaimTab =
    sidePanelTab?.activeTabId || searchParams.get('tabId')
      ? 'custom'
      : sidePanelTab?.activeSystemTab === 'debates' || pathname.endsWith('/debates')
        ? 'debates'
        : sidePanelTab?.activeSystemTab === 'claims' || pathname.endsWith('/claims')
          ? 'claims'
          : sidePanelTab?.activeSystemTab === 'sources' || pathname.endsWith('/sources')
            ? 'sources'
            : 'overview';

  const overviewHref = NavUtils.toEntity(spaceId, entityId);
  const systemTabs = [
    { label: 'Overview', href: overviewHref, sidePanelKey: 'overview' },
    { label: 'Debates', href: `${overviewHref}/debates`, sidePanelKey: 'debates' },
    { label: 'Claims', href: `${overviewHref}/claims`, sidePanelKey: 'claims' },
    { label: 'Sources', href: `${overviewHref}/sources`, sidePanelKey: 'sources' },
  ];

  if (isLoading && !entity) {
    return (
      <div className="flex flex-col gap-4 px-4 py-6 @[560px]:px-5">
        <Skeleton className="h-8 w-3/4 rounded" />
        <Skeleton className="h-[132px] w-full rounded-lg" />
        <Skeleton className="h-[96px] w-full rounded-lg" />
      </div>
    );
  }

  if (!entity) return null;

  return (
    <div className="@container">
      <div className="mx-auto flex w-full max-w-[720px] flex-col gap-6 px-4 py-6 @[560px]:gap-8 @[560px]:px-5 @[560px]:py-8">
        {/* Hero */}
        <header className="flex flex-col gap-3">
          {/* `text-pretty`, not `text-balance`. Balancing evens every line to the same length,
              which on a claim — a full sentence running to three or four lines — leaves each one
              breaking well short of the measure and reads as wrapping early. Pretty only avoids a
              stranded last word, so the lines fill. */}
          <h1 className="text-[1.5rem] leading-[1.3] font-semibold tracking-[-0.4px] text-pretty text-text @[560px]:text-[1.75rem]">
            {entity.name ?? entity.id}
          </h1>

          {/* Clamped, like entity pages and the side panel (GEO-2772). What is shared is the line
              budget, not the cut: wrapping differs with width, so the route, the side panel and a
              phone — three widths of one layout, per the note above — break at different words.
              They give up the same three lines of vertical space, which a character count could
              not do; the same count spends a different number of lines at each width, which is the
              measurement the reader actually feels.

              `ClampedText` measures an unclamped clone, so the toggle appears only when something
              is genuinely hidden, and it is unaffected by the naive-overflow bug GEO-2756 fixed in
              the feed's own title. */}
          {entity.description && (
            <ClampedText
              text={entity.description}
              maxLines={ENTITY_DESCRIPTION_MAX_LINES}
              variant="body"
              textClassName="wrap-break-word text-grey-04"
            />
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
            {/* Among the chips that say what this is, which is what "contested" is — and the same
                component the cards use, so all three surfaces move together. Not a chip itself:
                the flame and red are what make it findable among neutral ones. */}
            {summary.isControversial ? <ControversialTag /> : null}
          </div>
        </header>

        {/* The topic view's Subtopics, drawing a claim's Topics (GEO-2781) — same question for the
            reader, so the same answer rather than two that look alike until one of them changes.
            Directly under the header, where the topic view puts its own: on a claim the thing worth
            offering before the argument itself is somewhere else to take it. */}
        <RelationChipSection label="Topics" relations={topics} spaceId={spaceId} />

        <EntityTabs
          entityId={entityId}
          spaceId={spaceId}
          initialTabRelations={initialTabRelations}
          tabEntities={tabEntities}
          systemTabsBefore={systemTabs}
          reservedSystemLabels={SYSTEM_TAB_LABELS}
          divideBeforeAuthored
        />

        <ClaimTabPanel
          activeTab={activeTab}
          entityId={entityId}
          spaceId={spaceId}
          entityRelations={entity.relations}
          responseKind={responseKind}
          summary={summary}
          state={state}
          row={row}
          record={record}
          hrefs={{ debates: systemTabs[1]!.href, claims: systemTabs[2]!.href }}
        />
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
  state,
  row,
  record,
  hrefs,
}: {
  activeTab: ClaimTab;
  entityId: string;
  spaceId: string;
  entityRelations: Relation[];
  responseKind: ClaimResponseState['responseKind'];
  summary: ClaimResponseState['summary'];
  state: ClaimResponseState;
  row: DebateClaim | null;
  record: ReturnType<typeof useClaimRecord>;
  hrefs: { debates: string; claims: string };
}) {
  if (activeTab === 'custom') return <Editor spaceId={spaceId} shouldHandleOwnSpacing />;

  if (activeTab === 'debates') {
    return (
      <PersonRecordFeed
        rows={record.debateRows}
        isLoading={record.debatesLoading}
        isError={record.debatesError}
        loadingLabel="Loading debates…"
        emptyLabel="No debates on this claim or its related claims yet."
        errorLabel="Couldn’t load debates."
        noun="debates"
      />
    );
  }

  if (activeTab === 'claims') {
    return (
      <PersonRecordFeed
        rows={record.claimRows}
        isLoading={record.claimsLoading}
        isError={record.claimsError}
        loadingLabel="Loading claims…"
        emptyLabel="No related debate claims yet."
        errorLabel="Couldn’t load claims."
        noun="claims"
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
      href: hrefs.debates,
      seeAllLabel: 'See all debates',
    },
    {
      key: 'claims',
      label: 'Claims',
      rows: record.claimRows,
      total: record.claimsTotal,
      isLoading: record.claimsLoading,
      isError: record.claimsError,
      href: hrefs.claims,
      seeAllLabel: 'See all claims',
    },
  ];

  return (
    <>
      {/* The response control is the first Overview section. Its summary is grouped with it because
          it is the result of the same choice, rather than an activity module between the position
          options and Activity. */}
      <section aria-label="Position response options" className="flex flex-col gap-3">
        <ClaimPositionSection entityId={entityId} spaceId={spaceId} state={state} row={row} />
        <ClaimVerdict entityId={entityId} spaceId={spaceId} responseKind={responseKind} summary={summary} />
      </section>
      <ProfileActivitySection kinds={kinds} />
      {/* Last, like the ordinary entity page. An empty thread is an invitation, not absence. */}
      <CommentSection entityId={entityId} spaceId={spaceId} />
    </>
  );
}

/**
 * Taking a side, and standing ready to argue it.
 *
 * Both live in one card, with the readiness switch in the header's top right and the side pills
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
    <section aria-label="Your position" className="rounded-lg border border-grey-02 bg-white p-4 @[560px]:p-5">
      {/* No readiness switch — the Debate toggle is gone from the product. Master left the header
          row that used to hold it; with nothing on its right there is no row, just a label. */}
      <SectionTitle>Your position</SectionTitle>
      <PositionRow
        positions={control.optimisticPositions}
        responseKind={readiness.response_kind}
        viewerPosition={control.viewerPosition}
        onRespond={control.respond}
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
