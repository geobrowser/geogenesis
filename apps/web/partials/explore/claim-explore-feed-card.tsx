'use client';

import * as React from 'react';

import cx from 'classnames';

import { ClaimEndSlot } from '~/core/claims/browse/claim-end-slot';
import type { ClaimResponseSummary } from '~/core/claims/browse/claim-response-summary';
import { ClaimSides, ClaimSplitBar, ClaimSummary, ControversialTag } from '~/core/claims/browse/claim-summary';
import { useClaimResponseState } from '~/core/claims/browse/use-claim-response-state';
import type { DebateClaim } from '~/core/debates/api';
import { useBackfillReadinessForHeldPosition } from '~/core/debates/backfill-readiness-for-held-position';
import { useDebateClaims } from '~/core/debates/hooks';
import { PositionRow, useClaimPositionControl } from '~/core/debates/matchmaking/matchmaking-claim-card';
import type { ExploreFeedItem } from '~/core/explore/fetch-explore-feed';
import { useNearViewport } from '~/core/hooks/use-near-viewport';
import { usePrivySignIn } from '~/core/hooks/use-privy-sign-in';
import { ENTITY_RESPONSE_COPY } from '~/core/responses/entity-response';
import { useQueryEntity } from '~/core/sync/use-store';

import { Text } from '~/design-system/text';

import { ExploreCardEntityLink } from './explore-card-entity-link';
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
 * is the way through to all of it.
 *
 * Where that title goes is the host's call, through `titleOpensSidePanel`: the side panel on
 * Explore, the entity page everywhere else this card is used. Either way it stays a real anchor
 * with a real href — only unmodified left clicks are intercepted — so cmd-click, shift-click and
 * middle click still open the page, and so does anyone reading the status bar before they click.
 *
 * Scoped to Claim entities by the caller. Every other type keeps the generic card untouched.
 */
export function ClaimExploreFeedCard({
  item,
  hideSpaceLink = false,
  hideJoinButton = false,
  titleOpensSidePanel = false,
}: {
  item: ExploreFeedItem;
  hideSpaceLink?: boolean;
  hideJoinButton?: boolean;
  /**
   * Whether the claim's name opens the entity side panel rather than navigating (GEO-2757).
   *
   * Threaded through for the same reason every other card body takes it: on Explore this card
   * *replaces* the generic one, so a claim that did not accept it would be the single card type on
   * that page whose name still navigated away — a difference nobody chose, introduced by this card
   * existing.
   */
  titleOpensSidePanel?: boolean;
}) {
  // The feed pre-mounts cards thousands of pixels below the fold, so the counts and the geo-chat
  // row are gated on proximity rather than on mount — otherwise every claim in every loaded page
  // fires its lookups at once. Sticky: once fetched, stay fetched.
  //
  // The shared hook rather than this card's own copy of it. The copy came first and the shared card
  // needed the same gating, so the logic was lifted; leaving the original behind would have left two
  // observers that are supposed to agree and no reason they would — and they had already diverged,
  // since only the lifted one falls back to fetching eagerly where `IntersectionObserver` is absent.
  const { ref: setContainer, nearViewport } = useNearViewport();

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

  const {
    responseKind,
    isResponseKindResolved,
    isViewerResponseResolved,
    responseBlockedReason,
    summary,
    claim,
    positions,
    readiness,
  } = useClaimResponseState({
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
  const control = useClaimPositionControl({
    claim,
    positions,
    readiness,
    answersReady: isResponseKindResolved && isViewerResponseResolved,
    responseBlockedReason,
    onRequireSignIn: promptSignIn,
  });
  // geo-chat's own row, not the merged `readiness` above — that one falls back to the graph, and
  // this repair is only for the gap where geo-chat holds the response and not the readiness.
  //
  // The feed is where the gap showed itself: a viewer scrolling past claims they hold positions on
  // saw their own face on the repaired ones and not the rest (GEO-2821). The card cannot be the one
  // surface that draws a held position without standing the viewer up on it.
  useBackfillReadinessForHeldPosition({ readiness: row, entityId: item.entityId, spaceId: item.spaceId });

  // Withheld while the counts are still out, so the column does not appear a beat after the card.
  // `hasCounts` as well as a non-zero total. The two are equivalent as the hook computes them —
  // without a baseline it reports no counts and zeroes the split — but this column states the rule
  // it depends on rather than inheriting it, the same as the claim page's verdict and the shared
  // summary. A verdict drawn from a failed read is the one thing all three must never draw.
  const hasVerdict = !summary.isLoading && summary.hasCounts && summary.total > 0;

  return (
    <article
      ref={setContainer}
      className={cx(
        '@container flex flex-col gap-4',
        // Wide: a feed row, separated from the next by a rule.
        'border-b border-divider py-4 last:border-b-0',
        // Narrow: the debates panel's card — boxed, rounded, and clipped so the grey footer band
        // takes the bottom corners with it. `pb-0` leaves the band flush against the base instead
        // of floating above a strip of white; the rule between rows goes, since a bordered card
        // already separates itself.
        'claim-card-narrow:rounded-2xl claim-card-narrow:overflow-hidden claim-card-narrow:border claim-card-narrow:border-grey-02 claim-card-narrow:p-4 claim-card-narrow:pb-0'
      )}
    >
      {/*
        Two zones, divided by a rule that runs the whole height: everything you can *do* to the claim
        on the left, everything describing its *state* on the right, with the meta row inside the
        split rather than spanning above it.

        A grid rather than nested flex, because the two widths want different orders. On a phone the
        verdict belongs between the claim and the pills — read it, then answer — while at desktop
        width it belongs beside both. Explicit placement says that in one place; ordering utilities
        smeared across four children would not.

        The narrowing rules are container queries, not media queries, because the width that decides
        between these two arrangements is the card's — not the window's. The card sits beside a side
        rail that used to hold a flat 360px down to its cutoff, so between roughly 1024px and 1200px
        of window the card was under 500px wide while `md:` (max-width 767px) still read false: the
        desktop two-column layout stayed on at a width that could not hold it, and the pills below
        truncated to "Ag..." and "Dis...". That is GEO-2774. The article carries `@container` above,
        so the base rules are still the desktop layout and `claim-card-narrow:` narrows them — the
        same shape as before, asking about the card instead of the viewport.

        That threshold is declared in styles.css beside `claim-pills-wide`, the pill-row width it is
        derived from; the arithmetic lives there so the two cannot drift apart. Stacking gives the
        pills the card's full width, which is the arrangement a phone already got.
      */}
      {/* `gap-x-6` to match the right column's `pl-6`, so the rule sits centred in a 24px gutter:
            the offer at the end of the meta row and the share below it are the same distance from
            it, rather than the offer floating 36px out while the number sits 24px in. */}
      <div
        className={cx(
          'grid claim-card-narrow:grid-cols-1 claim-card-narrow:gap-y-4',
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
              // `undefined` while the reads are out, so "not known yet" cannot read as "holds none".
              viewerPosition={isResponseKindResolved && isViewerResponseResolved ? control.viewerPosition : undefined}
              className="ml-auto"
            />
          }
          className="col-start-1 row-start-1 mb-3 claim-card-narrow:mb-0"
        />

        {/* No thumbnail: claims carry no image, so the generic card's 60px well is either an empty
            gutter or a placeholder that says nothing. The sentence gets the column instead — it
            runs to a median of 108 characters and needs it. */}
        <ExploreCardEntityLink
          item={item}
          opensSidePanel={titleOpensSidePanel}
          className="group/title col-start-1 row-start-2 min-w-0"
        >
          <h2 className="mt-0! text-[19px]! leading-[23px]! font-semibold! tracking-[-0.02em] text-pretty text-text group-hover/title:underline">
            {item.title}
          </h2>
        </ExploreCardEntityLink>

        <div
          className={cx(
            'col-start-1 row-start-3 mt-4 max-w-[360px] claim-card-narrow:mt-0',
            // Row 3 on a phone, above the verdict rather than below it — the order the debates
            // panel uses, where what you can *do* comes before what everyone else did. On a wide
            // card the verdict is a column beside this, so the question does not arise.
            hasVerdict && 'claim-card-narrow:row-start-3'
          )}
        >
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

        {/* Spans all three rows in the wide arrangement, which is what makes the rule full-height.
            The narrow variant drops the rule rather than rotating it — see the note on the
            component. */}
        {hasVerdict ? (
          <div className="col-start-2 row-span-3 row-start-1 border-l border-divider pl-6 claim-card-narrow:col-start-1 claim-card-narrow:row-span-1 claim-card-narrow:row-start-4 claim-card-narrow:border-l-0 claim-card-narrow:pl-0">
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
 * claim differently.
 *
 * Two arrangements of one set of facts, chosen by the card's own width:
 *
 *   * **Wide** keeps this column's own layout — drawn here rather than reusing `ClaimSummary`
 *     because the feed gives it a column to stand in rather than a strip, so the number can be set
 *     large, which is the whole reason to spend 186px on it.
 *   * **Narrow** hands over to `ClaimSummary`, the module the debates panel and the claim page use.
 *     A phone has no column to spend, and the expanded version there was the widest reading of the
 *     number on the smallest surface showing it.
 *
 * Both are mounted and one is hidden, which costs nothing it would not otherwise: `ClaimSides` and
 * `ClaimSummary`'s responder cluster read the *same* `entityRespondersQueryKey`, so react-query
 * serves both from one cache entry and one request. That is worth knowing before either side is
 * repointed at a query of its own.
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
    <>
      {/* Wide: this column's own arrangement. The narrow-width rules that used to enlarge it here
          are gone — a phone gets `ClaimSummary` below instead of a bigger version of this. */}
      <div className="claim-card-narrow:hidden">
        {/* The claim page's own top row, narrowed for the rail: the share and its verb on one
          baseline. No response count — this is the 220px rail, where it wrapped onto a line of its
          own. It used to be kept for the phone; the phone reads `ClaimSummary` now. */}
        <div className="flex items-baseline gap-1.5">
          <span className="text-[2rem] leading-none font-semibold tracking-[-0.8px] text-text tabular-nums">
            {percent}%
          </span>
          <Text as="span" variant="metadata" color="grey-04">
            {copy.positiveAction.toLowerCase()}
          </Text>
        </div>
        <ClaimSplitBar percent={percent} responseKind={responseKind} className="mt-3 h-1.5" />
        {/* The Controversial tag is not repeated here — it sits beside the space chip, where it says
          what kind of claim this is rather than adding a second voice to the split. */}
        {/* Stacked, because this is the 220px rail and it cannot hold both across. The phone's
          side-by-side arrangement went with the phone, which no longer draws this block. */}
        <ClaimSides
          entityId={entityId}
          spaceId={spaceId}
          responseKind={responseKind}
          summary={summary}
          className="mt-3 flex flex-col gap-1.5"
        />
      </div>

      {/* Narrow: the debates panel's footer band — share, split and faces on one line, on grey,
          bled to the card's edges by `-mx-4` against its `p-4`. The card carries `pb-0` so this
          reaches the base, and `overflow-hidden` so the band is clipped to the rounded corners
          rather than squaring them off. */}
      <div className="hidden claim-card-narrow:block">
        <ClaimSummary
          entityId={entityId}
          spaceId={spaceId}
          responseKind={responseKind}
          summary={summary}
          layout="inline"
          className="-mx-4 border-t border-divider bg-grey-01 px-4 py-2"
        />
      </div>
    </>
  );
}
