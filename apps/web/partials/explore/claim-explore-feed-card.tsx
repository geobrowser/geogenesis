'use client';

import * as React from 'react';

import cx from 'classnames';

import { ClaimEndSlot } from '~/core/claims/browse/claim-end-slot';
import type { ClaimResponseSummary } from '~/core/claims/browse/claim-response-summary';
import { ClaimSideSummary, ControversialTag } from '~/core/claims/browse/claim-summary';
import { useClaimResponseState } from '~/core/claims/browse/use-claim-response-state';
import type { DebateClaim } from '~/core/debates/api';
import { useDebateClaims } from '~/core/debates/hooks';
import { PositionRow, useClaimPositionControl } from '~/core/debates/matchmaking/matchmaking-claim-card';
import type { ExploreFeedItem } from '~/core/explore/fetch-explore-feed';
import { usePrivySignIn } from '~/core/hooks/use-privy-sign-in';
import { ENTITY_RESPONSE_COPY } from '~/core/responses/entity-response';
import { useQueryEntity } from '~/core/sync/use-store';
import { NavUtils } from '~/core/utils/utils';

import { PrefetchLink as Link } from '~/design-system/prefetch-link';
import { Text } from '~/design-system/text';

import { ExploreMetaRow } from './explore-meta-row';

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
 * At phone width the verdict moves above the pills and the rule goes away entirely rather than
 * turning horizontal. Deliberate, and matching the claim page's own phone layout: stacked, the two
 * zones are already separated by the stack, and a full-bleed rule across a narrow card reads as the
 * end of the card rather than as a divider inside it.
 *
 * No actions row. It briefly carried debate and related-claim counts, which the coverage numbers
 * did not support — 33 debates against 311,047 claims — and then comments and Share, which is what
 * the generic card has. Even that earned less than it cost here: a strip of small grey glyphs under
 * a card whose whole lower half is already the response controls and the verdict. The claim's title
 * links to its page, where the comments are.
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

  // Behind the same gate as the other two reads. The feed pre-mounts cards thousands of pixels
  // below the fold, so an ungated hydration here is a graph read per claim on mount — exactly the
  // cost the observer was added to avoid, and the one read that was still escaping it.
  //
  // Off-screen this answers `null`, which leaves the pills disabled. That is the correct answer:
  // nothing has said which vocabulary the claim uses yet, and nobody can press a card they have
  // not scrolled to.
  const { entity } = useQueryEntity({ id: item.entityId, spaceId: item.spaceId, enabled: nearViewport });

  const rowQuery = useDebateClaims(item.spaceId, [item.entityId], nearViewport);
  const row: DebateClaim | null = rowQuery.data?.claims.find(claim => claim.claim_entity_id === item.entityId) ?? null;

  const { responseKind, isResponseKindResolved, summary, claim, positions, readiness } = useClaimResponseState({
    claimId: item.entityId,
    spaceId: item.spaceId,
    row,
    entity,
    title: item.title,
    // Held with the other two reads until the card is near the viewport.
    enabled: nearViewport,
  });

  // A signed-out visitor gets the sign-in prompt rather than two dead pills, the same way the claim
  // page does — and through the same hook, which also keeps Privy's session restoration from being
  // mistaken for a login somebody asked for.
  const promptSignIn = usePrivySignIn();
  const control = useClaimPositionControl({ claim, positions, readiness, onRequireSignIn: promptSignIn });

  // Withheld while the counts are still out, so the column does not appear a beat after the card.
  const hasVerdict = !summary.isLoading && summary.total > 0;

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
      {/* `gap-x-6` to match the right column's `pl-6`, so the rule sits centred in a 24px gutter:
            the offer at the end of the meta row and the share below it are the same distance from
            it, rather than the offer floating 36px out while the number sits 24px in. */}
      <div
        className={cx(
          'grid md:grid-cols-1 md:gap-y-4',
          // No verdict, no column, no rule. A claim nobody has answered has nothing to report, and
          // an empty 220px cell behind a vertical line reads as something having failed to load —
          // where the claim simply taking the full width reads as a claim nobody has answered.
          hasVerdict ? 'grid-cols-[minmax(0,1fr)_220px] gap-x-6' : 'grid-cols-1'
        )}
      >
        {/* The same row every other explore card draws, through the same component. It was a copy
            once, and the copy drifted in four ways the eye could see before anyone found them in a
            diff — see the note on `ExploreMetaRow`. What a claim adds is Controversial beside its
            type, and the offer pinned to the end. */}
        <ExploreMetaRow
          item={item}
          hideSpaceLink={hideSpaceLink}
          hideJoinButton={hideJoinButton}
          extraSegments={summary.isControversial ? [<ControversialTag key="controversial" />] : undefined}
          endSlot={
            <ClaimEndSlot
              claimId={item.entityId}
              spaceId={item.spaceId}
              activeDebate={row?.active_debate}
              enabled={nearViewport}
              className="ml-auto"
            />
          }
          className="col-start-1 row-start-1 mb-3 md:mb-0"
        />

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

        <div
          className={cx(
            'col-start-1 row-start-3 mt-4 max-w-[360px] md:mt-0',
            // Row 4 only when the verdict is in row 3. Without it the pills would sit a row below an
            // empty one, and an implicit row of zero height still costs the `gap-y-4` on either side
            // of it — so the space between the claim and the pills would silently double.
            hasVerdict && 'md:row-start-4'
          )}
        >
          <PositionRow
            positions={control.optimisticPositions}
            responseKind={responseKind}
            viewerPosition={control.viewerPosition}
            onRespond={control.respond}
            disabled={!control.canRespond || !isResponseKindResolved}
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

        {/* Spans all three rows at desktop width, which is what makes the rule full-height. The
            `md` variant drops the rule rather than rotating it — see the note on the component. */}
        {hasVerdict ? (
          <div className="col-start-2 row-span-3 row-start-1 border-l border-divider pl-6 md:col-start-1 md:row-span-1 md:row-start-3 md:border-l-0 md:pl-0">
            <ClaimVerdictColumn
              entityId={item.entityId}
              spaceId={item.spaceId}
              responseKind={responseKind}
              summary={summary}
            />
          </div>
        ) : null}
      </div>
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
  summary: ClaimResponseSummary;
}) {
  const copy = ENTITY_RESPONSE_COPY[responseKind];

  const percent = summary.percent ?? 0;

  // The share and its verb on one line, the bar under it, then the two sides — the claim page's own
  // arrangement, through the claim page's own component. Two sides rather than one merged cluster
  // because the faces then belong to a side: pressing Agree opens who agreed, not a mixed list to
  // read through. Stacked rather than pushed to opposite ends, which is what the page does with the
  // width to do it; at 220px they would wrap into each other.
  return (
    <div>
      {/* The claim page's own top row, narrowed for the rail: the share and its verb on one
          baseline, and — where there is width for it — how many responses that share is *of*. In
          the 220px rail the count would wrap onto a line of its own, so it stays to the phone,
          where this module is the claim page's module at the claim page's size. */}
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-1">
        <span className="flex items-baseline gap-1.5">
          <span className="text-[2rem] leading-none font-semibold tracking-[-0.8px] text-text tabular-nums md:text-[2.5rem] md:tracking-[-1px]">
            {percent}%
          </span>
          <Text as="span" variant="metadata" color="grey-04">
            {copy.positiveAction.toLowerCase()}
          </Text>
        </span>
        <Text as="span" variant="metadata" color="grey-04" className="hidden tabular-nums md:block">
          {summary.total} {summary.total === 1 ? 'response' : 'responses'}
        </Text>
      </div>
      <div
        className="mt-3 flex h-1.5 overflow-hidden rounded-full bg-grey-01 md:mt-4 md:h-2"
        role="img"
        aria-label={`${percent}% ${copy.positiveAction.toLowerCase()}, ${100 - percent}% ${copy.negativeAction.toLowerCase()}`}
      >
        <span className="bg-green" style={{ width: `${percent}%` }} />
        <span className="bg-red-01" style={{ width: `${100 - percent}%` }} />
      </div>
      {/* The Controversial tag is not repeated here — it sits beside the space chip, where it says
          what kind of claim this is rather than adding a second voice to the split. */}
      {/* Stacked in the desktop rail, which is 220px and cannot hold both. Side by side on a phone,
          where the column is the full width of the card — agree left, disagree pushed right, the
          same arrangement the claim page uses when it has the room. */}
      <div className="mt-3 flex flex-col gap-1.5 md:flex-row md:items-center md:justify-between md:gap-4">
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
