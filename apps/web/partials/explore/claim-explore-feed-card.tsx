'use client';

import * as React from 'react';

import { ClaimEndSlot } from '~/core/claims/browse/claim-end-slot';
import {
  positionSummariesFromCounts,
  viewerResponseFromDirection,
} from '~/core/claims/browse/claim-position-summaries';
import { claimSummaryTier, useClaimResponseSummary } from '~/core/claims/browse/claim-response-summary';
import { ClaimResponders, ControversialTag } from '~/core/claims/browse/claim-summary';
import { CLAIM_TYPE_ID, TOPICS_PROPERTY_ID } from '~/core/claims/ontology';
import { claimResponseKind } from '~/core/claims/response-kind';
import type { DebateClaim } from '~/core/debates/api';
import { useDebateClaims } from '~/core/debates/hooks';
import { PositionRow, useClaimPositionControl } from '~/core/debates/matchmaking/matchmaking-claim-card';
import { DEBATE_CLAIMS_PROPERTY_ID, DEBATE_TYPE_ID, SOURCES_PROPERTY_ID } from '~/core/debates/ontology';
import { formatExploreRelativeTime } from '~/core/explore/explore-relative-time';
import type { ExploreFeedItem } from '~/core/explore/fetch-explore-feed';
import { useEntitySidePanel } from '~/core/hooks/use-entity-side-panel';
import { usePrivySignIn } from '~/core/hooks/use-privy-sign-in';
import { ID } from '~/core/id';
import { ENTITY_RESPONSE_COPY } from '~/core/responses/entity-response';
import { useQueryEntities, useQueryEntity } from '~/core/sync/use-store';
import type { Relation } from '~/core/types';
import { NavUtils } from '~/core/utils/utils';

import { Megaphone } from '~/design-system/icons/megaphone';
import { PrefetchLink as Link } from '~/design-system/prefetch-link';
import { Text } from '~/design-system/text';

import { ExploreClaimsIcon } from './explore-claims-icon';
import { ExploreCommentsIcon } from './explore-comments-icon';
import { ExploreJoinSpaceButton } from './explore-join-space-button';
import { ExploreShareIcon } from './explore-share-icon';
import { SpaceThumb } from './space-thumb';

/** Enough to report a count and know whether there are more; nothing here needs the whole list. */
const COUNT_PAGE_SIZE = 6;

/**
 * A Claim in the explore feed.
 *
 * The generic card treats a claim as an entity with a vote counter: a 60px thumbnail it has no
 * image for, and a bare percentage between two chevrons with no side labels, so Verify/Dispute and
 * Agree/Disagree look identical. This is the one surface where readers have not opted into claims,
 * which makes it the worst place to be ambiguous about what the buttons do.
 *
 * Two zones, divided. Everything you can *do* to the claim sits on the left — the claim, the pills,
 * the offer that ends the meta row. Everything describing its *state* sits on the right, behind a
 * rule that runs the full height so the meta row is inside the split rather than spanning above it.
 * At phone width the rule turns horizontal and the verdict moves above the pills: same two zones,
 * same order, rotated.
 *
 * Scoped to Claim entities by the caller. Every other type keeps the generic card untouched.
 */
export function ClaimExploreFeedCard({
  item,
  hideSpaceLink = false,
  hideJoinButton = false,
}: {
  item: ExploreFeedItem;
  hideSpaceLink?: boolean;
  hideJoinButton?: boolean;
}) {
  const [container, setContainer] = React.useState<HTMLElement | null>(null);

  // The feed pre-mounts cards thousands of pixels below the fold, so the counts and the geo-chat
  // row are gated on proximity rather than on mount — otherwise every claim in every loaded page
  // fires its lookups at once. Sticky: once fetched, stay fetched. Same approach the debate card
  // takes for its video.
  const [nearViewport, setNearViewport] = React.useState(false);
  React.useEffect(() => {
    if (!container || nearViewport) return;
    const observer = new IntersectionObserver(
      entries => {
        if (entries.some(entry => entry.isIntersecting)) setNearViewport(true);
      },
      { rootMargin: '800px' }
    );
    observer.observe(container);
    return () => observer.disconnect();
  }, [container, nearViewport]);

  const { entity } = useQueryEntity({ id: item.entityId, spaceId: item.spaceId });

  const rowQuery = useDebateClaims(item.spaceId, [item.entityId], nearViewport);
  const row: DebateClaim | null = rowQuery.data?.claims.find(claim => claim.claim_entity_id === item.entityId) ?? null;

  // One effective kind for the card. geo-chat's copy wins where it has a row; the graph answers for
  // spaces geo-chat does not index. Deriving it twice is what let a claim count one vote kind while
  // publishing another.
  const responseKind = row?.response_kind ?? (entity ? claimResponseKind(entity, item.spaceId) : 'stance');
  const summary = useClaimResponseSummary(item.entityId, item.spaceId, responseKind);

  const positions = React.useMemo(
    () => positionSummariesFromCounts(summary.positive, summary.negative, responseKind, row),
    [responseKind, row, summary.negative, summary.positive]
  );

  const claim = React.useMemo(
    () => ({
      id: row?.id ?? item.entityId,
      space_id: item.spaceId,
      claim_entity_id: item.entityId,
      claim: item.title,
      description: null,
    }),
    [item.entityId, item.spaceId, item.title, row?.id]
  );

  const readiness = React.useMemo(
    () => ({
      response_kind: responseKind,
      // The on-chain summary resolves independently of geo-chat, so an unarrived row is not read as
      // "no response" — which would draw the viewer's own side unselected and turn a click on it
      // into a republish rather than a clear.
      viewer_response: row?.viewer_response ?? viewerResponseFromDirection(summary.viewerDirection, responseKind),
      viewer_debate_ready: row?.viewer_debate_ready ?? false,
      readiness_disabled_reason: row?.readiness_disabled_reason ?? null,
    }),
    [responseKind, row, summary.viewerDirection]
  );

  // A signed-out visitor gets the sign-in prompt rather than two dead pills, the same way the claim
  // page does — and through the same hook, which also keeps Privy's session restoration from being
  // mistaken for a login somebody asked for.
  const promptSignIn = usePrivySignIn();
  const control = useClaimPositionControl({ claim, positions, readiness, onRequireSignIn: promptSignIn });

  const timeAgo = formatExploreRelativeTime(item.createdAtSec);
  const sourceCount = useSourceCount(entity?.relations);
  const topicIds = useTopicIds(entity?.relations);

  return (
    <article ref={setContainer} className="flex flex-col gap-4 border-b border-divider py-4 last:border-b-0">
      {/*
        Two zones, divided by a rule that runs the whole height: everything you can *do* to the claim
        on the left, everything describing its *state* on the right, with the meta row inside the
        split rather than spanning above it.

        A grid rather than nested flex, because the two widths want different orders. On a phone the
        verdict belongs between the claim and the pills — read it, then answer — while at desktop
        width it belongs beside both. Explicit placement says that in one place; ordering utilities
        smeared across four children would not.

        `md` is max-width 767px in this codebase, so the *base* rules are the desktop layout and the
        `md:` rules narrow it. Container queries are not an option here: nothing in the explore feed
        establishes a container, so a `@[640px]:` variant would silently never apply.
      */}
      <div className="grid grid-cols-[minmax(0,1fr)_220px] gap-x-9 md:grid-cols-1 md:gap-y-4">
        <div className="col-start-1 row-start-1 mb-3 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 md:mb-0">
          {!hideSpaceLink ? (
            <Link
              href={NavUtils.toSpace(item.spaceId)}
              className="flex min-w-0 items-center gap-1.5 text-[14px] leading-[13px] tracking-[-0.35px] text-text hover:underline"
            >
              <SpaceThumb image={item.spaceImage} name={item.spaceName} />
              <span className="min-w-0 truncate">{item.spaceName}</span>
            </Link>
          ) : null}
          {!hideJoinButton && !item.isMemberOrEditor ? (
            <ExploreJoinSpaceButton
              spaceId={item.spaceId}
              hasRequestedSpaceMembership={item.hasPendingMembershipRequest}
              variant="pill"
              label="Join"
            />
          ) : null}
          {/* Beside the space, because it says what kind of claim this is. */}
          {summary.isControversial ? <ControversialTag /> : null}
          {timeAgo ? (
            <span className="text-[12px] leading-[13px] tracking-[-0.35px] text-grey-04">· {timeAgo}</span>
          ) : null}
          <ClaimEndSlot
            claimId={item.entityId}
            spaceId={item.spaceId}
            activeDebate={row?.active_debate}
            enabled={nearViewport}
            className="ml-auto"
          />
        </div>

        {/* No thumbnail: claims carry no image, so the generic card's 60px well is either an empty
            gutter or a placeholder that says nothing. The sentence gets the column instead — it
            runs to a median of 108 characters and needs it. */}
        <Link
          href={NavUtils.toEntity(item.spaceId, item.entityId)}
          className="group/title col-start-1 row-start-2 min-w-0"
        >
          <h2 className="mt-0! text-[19px]! leading-[23px]! font-semibold! tracking-[-0.02em] text-pretty text-text group-hover/title:underline">
            {item.title}
          </h2>
        </Link>

        <div className="col-start-1 row-start-3 mt-4 max-w-[360px] md:row-start-4 md:mt-0">
          <PositionRow
            positions={control.optimisticPositions}
            responseKind={responseKind}
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
        </div>

        {/* Spans all three rows at desktop width, which is what makes the rule full-height. */}
        <div className="col-start-2 row-span-3 row-start-1 border-l border-divider pl-6 md:col-start-1 md:row-span-1 md:row-start-3 md:border-b md:border-l-0 md:pb-4 md:pl-0">
          {summary.isLoading ? null : (
            <ClaimVerdictColumn
              entityId={item.entityId}
              spaceId={item.spaceId}
              responseKind={responseKind}
              summary={summary}
            />
          )}
          <ClaimSources count={sourceCount} spaceId={item.spaceId} entityId={item.entityId} />
        </div>
      </div>

      <ClaimCardActions item={item} enabled={nearViewport} topicIds={topicIds} />
    </article>
  );
}

/**
 * The share, the split and who answered — or an invitation where nobody has.
 *
 * The tier is `claimSummaryTier`'s, so this column and the claim page cannot describe the same
 * claim differently. Drawn here rather than reusing the card's `ClaimSummary` because the feed
 * gives it a column to stand in rather than a strip: the number can be set large, which is the
 * whole reason to spend 186px on it.
 */
function ClaimVerdictColumn({
  entityId,
  spaceId,
  responseKind,
  summary,
}: {
  entityId: string;
  spaceId: string;
  responseKind: 'stance' | 'veracity';
  summary: ReturnType<typeof useClaimResponseSummary>;
}) {
  const copy = ENTITY_RESPONSE_COPY[responseKind];
  const tier = claimSummaryTier(summary.total);

  if (tier === 'invite') {
    return (
      <div className="md:flex md:flex-wrap md:items-baseline md:gap-x-1.5">
        <Text as="p" variant="metadataMedium" color="text" className="leading-snug">
          Nobody has answered yet
        </Text>
        <Text as="p" variant="metadata" color="grey-04" className="mt-2 md:mt-0">
          Be the first to {copy.positiveAction.toLowerCase()} it.
        </Text>
      </div>
    );
  }

  // The shared control, not a bare avatar stack. Pressing it opens who took which side — the same
  // list the claim page shows. This card drew the faces without the popover around them, which is
  // exactly the "faces you cannot press" problem the cluster exists to solve.
  const responders = (
    <ClaimResponders
      entityId={entityId}
      spaceId={spaceId}
      responseKind={responseKind}
      summary={summary}
      label={copy.viewResponders}
    />
  );

  const percent = summary.percent ?? 0;

  // One line, then the bar. The share and its verb share a baseline, the faces sit at the far end
  // of that same line, and the bar runs underneath the width of the column.
  //
  // This is now the same arrangement at both widths, which it did not start as: the rail had a
  // stack and the phone had a band. Two layouts for four elements was one more than the content
  // justified, and the condensed line turned out to read better in the rail too — the number keeps
  // its size, the label stops taking a line of its own, and the bar gets the full width to be read
  // across instead of competing with the faces beside it.
  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-x-3 gap-y-1">
        <span className="flex items-baseline gap-1.5">
          <span className="text-[2rem] leading-none font-semibold tracking-[-0.8px] text-text tabular-nums">
            {percent}%
          </span>
          <Text as="span" variant="metadata" color="grey-04">
            {copy.positiveAction.toLowerCase()}
          </Text>
        </span>
        {/* The Controversial tag is not repeated here — it sits beside the space chip, where it says
            what kind of claim this is rather than adding a second voice to the split. */}
        <span className="shrink-0">{responders}</span>
      </div>
      <div
        className="mt-3 flex h-1.5 overflow-hidden rounded-full bg-grey-01"
        role="img"
        aria-label={`${percent}% ${copy.positiveAction.toLowerCase()}, ${100 - percent}% ${copy.negativeAction.toLowerCase()}`}
      >
        <span className="bg-green" style={{ width: `${percent}%` }} />
        <span className="bg-red-01" style={{ width: `${100 - percent}%` }} />
      </div>
    </div>
  );
}

/**
 * What else there is of this claim: debates, neighbours, comments, a way to pass it on.
 *
 * Each glyph renders only when it has something to report. A row of zeroes advertises emptiness,
 * where a short row simply says less — and on this data most rows are short.
 *
 * Every item opens the claim in the side panel. That is deliberately the whole interaction for now:
 * it makes the numbers worth pressing without inventing a second panel UX, and deep-linking to the
 * right section of the claim page is the obvious follow-up.
 *
 * All of it left-aligned in one run, Share last. Sources used to sit here too, pushed to the far
 * right — which looked composed on a busy claim and stranded on an ordinary one. They have moved
 * under the bar in the verdict column, where there is room to name them rather than count them.
 */
function ClaimCardActions({
  item,
  enabled,
  topicIds,
}: {
  item: ExploreFeedItem;
  enabled: boolean;
  topicIds: string[];
}) {
  const { openSidePanel } = useEntitySidePanel();

  const { entities: debates, hasNextPage: moreDebates } = useQueryEntities({
    where: {
      types: [{ id: { equals: DEBATE_TYPE_ID } }],
      spaces: [{ equals: item.spaceId }],
      relations: [
        { typeOf: { id: { equals: DEBATE_CLAIMS_PROPERTY_ID } }, toEntity: { id: { equals: item.entityId } } },
      ],
    },
    first: COUNT_PAGE_SIZE,
    enabled,
  });

  // Only asked for when the claim actually carries topics, which is 15% of them — so this query
  // never runs for the great majority of cards in the feed.
  const { entities: related, hasNextPage: moreRelated } = useQueryEntities({
    where: {
      types: [{ id: { equals: CLAIM_TYPE_ID } }],
      spaces: [{ equals: item.spaceId }],
      relations: [{ typeOf: { id: { equals: TOPICS_PROPERTY_ID } }, toEntity: { id: { in: topicIds } } }],
    },
    first: COUNT_PAGE_SIZE,
    enabled: enabled && topicIds.length > 0,
  });

  const debateCount = countLabel(debates.length, moreDebates);
  // This claim is in its own topic results, so it is filtered out before counting.
  const relatedCount = countLabel(related.filter(entity => !ID.equals(entity.id, item.entityId)).length, moreRelated);

  const open = () => openSidePanel(item.entityId, item.spaceId, false);
  const actionClassName = 'inline-flex items-center gap-1.5 text-[14px] text-grey-04 transition-colors hover:text-text';

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-divider pt-3">
      {debateCount ? (
        <button
          type="button"
          onClick={open}
          aria-label={`${debateCount} debates on this claim`}
          className={actionClassName}
        >
          <span className="block size-3.5 shrink-0">
            <Megaphone />
          </span>
          <span className="tabular-nums">{debateCount}</span>
        </button>
      ) : null}
      {relatedCount ? (
        <button type="button" onClick={open} aria-label={`${relatedCount} related claims`} className={actionClassName}>
          <ExploreClaimsIcon />
          <span className="tabular-nums">{relatedCount}</span>
        </button>
      ) : null}
      {item.commentCount > 0 ? (
        <Link href={`${NavUtils.toEntity(item.spaceId, item.entityId)}#entity-comments`} className={actionClassName}>
          <ExploreCommentsIcon />
          <span className="tabular-nums">{item.commentCount}</span>
        </Link>
      ) : null}
      <button type="button" onClick={open} className={actionClassName}>
        <ExploreShareIcon />
        <span>Share</span>
      </button>
    </div>
  );
}

/** `6` where the page filled and there may be more, so a count never claims to be the whole set. */
function countLabel(shown: number, hasMore: boolean): string | null {
  if (shown === 0) return null;
  return hasMore ? `${shown}+` : String(shown);
}

/**
 * How many distinct things this claim was lifted from.
 *
 * Deduped by target: the same story reaches the graph more than once, and the sample contains
 * near-identical article titles pointing at one event. Counting the relations rather than their
 * targets would report corroboration that isn't there.
 */
function useSourceCount(relations: Relation[] | undefined): number {
  return React.useMemo(() => {
    // Deduped by target: the same story reaches the graph more than once, and the sample contains
    // near-identical article titles pointing at one event. Counting relations rather than their
    // targets would report corroboration that is not there.
    const ids = new Set<string>();
    for (const relation of relations ?? []) {
      if (relation.isDeleted === true) continue;
      if (!ID.equals(relation.type.id, SOURCES_PROPERTY_ID)) continue;
      ids.add(relation.toEntity.id.toLowerCase());
    }
    return ids.size;
  }, [relations]);
}

function useTopicIds(relations: Relation[] | undefined): string[] {
  return React.useMemo(
    () =>
      (relations ?? [])
        .filter(relation => relation.isDeleted !== true && ID.equals(relation.type.id, TOPICS_PROPERTY_ID))
        .map(relation => relation.toEntity.id),
    [relations]
  );
}

/**
 * Where the claim came from, under the split it belongs to.
 *
 * A count, not a list — and that is a concession to the data rather than a preference. A `Sources`
 * relation points at an Article whose name is the article's *headline*: a median of 73 characters
 * and up to 128, not an outlet. There is no publisher field to read instead. So "Reuters · Kyiv
 * Independent" is not something this card can render; what it would actually print is two truncated
 * headlines stacked in a 220px column, which buries the verdict above it and still does not tell
 * you who reported the story.
 *
 * The count is worth keeping on its own. 39% of claims carry a source and 45% of those carry more
 * than one, up to seven — and several outlets reporting the same thing independently is
 * corroboration, which is a fact about the claim even when the titles are unreadable at this size.
 *
 * Opens the claim, where `ClaimProvenance` has the width to list them properly.
 */
function ClaimSources({ count, spaceId, entityId }: { count: number; spaceId: string; entityId: string }) {
  const { openSidePanel } = useEntitySidePanel();

  if (count === 0) return null;

  return (
    <button
      type="button"
      onClick={() => openSidePanel(entityId, spaceId, false)}
      aria-label={`${count} ${count === 1 ? 'source' : 'sources'} for this claim`}
      className="mt-3 block text-footnoteMedium text-grey-04 tabular-nums transition-colors hover:text-text"
    >
      {count} {count === 1 ? 'source' : 'sources'}
    </button>
  );
}
