'use client';

import * as React from 'react';

import { ClaimEndSlot } from '~/core/claims/browse/claim-end-slot';
import {
  positionSummariesFromCounts,
  viewerResponseFromDirection,
} from '~/core/claims/browse/claim-position-summaries';
import { claimSummaryTier, useClaimResponseSummary } from '~/core/claims/browse/claim-response-summary';
import { ClaimSideSummary, ControversialTag } from '~/core/claims/browse/claim-summary';
import { CLAIM_TYPE_ID, TOPICS_PROPERTY_ID } from '~/core/claims/ontology';
import { claimResponseKind } from '~/core/claims/response-kind';
import type { DebateClaim } from '~/core/debates/api';
import { useDebateClaims } from '~/core/debates/hooks';
import { PositionRow, useClaimPositionControl } from '~/core/debates/matchmaking/matchmaking-claim-card';
import { DEBATE_CLAIMS_PROPERTY_ID, DEBATE_TYPE_ID } from '~/core/debates/ontology';
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
  // Deduped by normalized id and named only where the type has a name — an unnamed one would render
  // as a raw id, which says less than nothing. Mirrors what `BaseExploreFeedCard` does, so a claim
  // and its neighbours in the feed label themselves the same way.
  const typeNames = React.useMemo(() => {
    const seen = new Set<string>();
    const names: string[] = [];
    for (const type of item.types) {
      if (!type.name) continue;
      const key = type.id.replace(/-/g, '').toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      names.push(type.name);
    }
    return names;
  }, [item.types]);
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
          {/* The entity's type, the way every other explore card names it. It went out with the
              topics, which was wrong: a topic is a subject a claim happens to carry, where the type
              is what the thing *is* — and in a feed of mixed entities that is the first thing a
              reader needs. */}
          {typeNames.length > 0 ? (
            <span className="text-[14px] leading-[13px] tracking-[-0.35px] text-grey-04">
              · {typeNames.join(' · ')}
            </span>
          ) : null}
          {/* Beside the space, because it says what kind of claim this is. */}
          {summary.isControversial ? <ControversialTag /> : null}
          {timeAgo ? (
            <span className="text-[14px] leading-[13px] tracking-[-0.35px] text-grey-04">· {timeAgo}</span>
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

  const percent = summary.percent ?? 0;

  // The share and its verb on one line, the bar under it, then the two sides — the claim page's own
  // arrangement, through the claim page's own component. Two sides rather than one merged cluster
  // because the faces then belong to a side: pressing Agree opens who agreed, not a mixed list to
  // read through. Stacked rather than pushed to opposite ends, which is what the page does with the
  // width to do it; at 220px they would wrap into each other.
  return (
    <div>
      <span className="flex items-baseline gap-1.5">
        <span className="text-[2rem] leading-none font-semibold tracking-[-0.8px] text-text tabular-nums">
          {percent}%
        </span>
        <Text as="span" variant="metadata" color="grey-04">
          {copy.positiveAction.toLowerCase()}
        </Text>
      </span>
      <div
        className="mt-3 flex h-1.5 overflow-hidden rounded-full bg-grey-01"
        role="img"
        aria-label={`${percent}% ${copy.positiveAction.toLowerCase()}, ${100 - percent}% ${copy.negativeAction.toLowerCase()}`}
      >
        <span className="bg-green" style={{ width: `${percent}%` }} />
        <span className="bg-red-01" style={{ width: `${100 - percent}%` }} />
      </div>
      {/* The Controversial tag is not repeated here — it sits beside the space chip, where it says
          what kind of claim this is rather than adding a second voice to the split. */}
      <div className="mt-3 flex flex-col gap-1.5">
        <ClaimSideSummary
          swatchClassName="bg-green"
          label={copy.positiveAction}
          count={summary.positive}
          direction="positive"
          entityId={entityId}
          spaceId={spaceId}
          responseKind={responseKind}
          viewerDirection={summary.viewerDirection}
          viewerSpaceId={summary.viewerSpaceId}
        />
        <ClaimSideSummary
          swatchClassName="bg-red-01"
          label={copy.negativeAction}
          count={summary.negative}
          direction="negative"
          entityId={entityId}
          spaceId={spaceId}
          responseKind={responseKind}
          viewerDirection={summary.viewerDirection}
          viewerSpaceId={summary.viewerSpaceId}
        />
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
 * All of it left-aligned in one run, Share last, and no rule above it. The card already ends at a
 * divider of its own, so a second line a few pixels up boxed the actions in for no reason — and on
 * a claim with nothing but Share it drew a lot of attention to very little.
 *
 * Sources used to sit here as a count and briefly moved to the verdict column. They are off the
 * card entirely now: a `Sources` relation names the article's headline rather than its outlet —
 * a median of 73 characters — so there was never a version of this that read well at card size.
 * `ClaimProvenance` on the claim page has the width to do it properly.
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
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
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

function useTopicIds(relations: Relation[] | undefined): string[] {
  return React.useMemo(
    () =>
      (relations ?? [])
        .filter(relation => relation.isDeleted !== true && ID.equals(relation.type.id, TOPICS_PROPERTY_ID))
        .map(relation => relation.toEntity.id),
    [relations]
  );
}
