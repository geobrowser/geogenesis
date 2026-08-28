'use client';

import * as React from 'react';

import cx from 'classnames';

import { ENTITY_RESPONSE_COPY, type ResponseKind } from '~/core/responses/entity-response';

import { Skeleton } from '~/design-system/skeleton';
import { Text } from '~/design-system/text';

import { type ClaimResponseSummary, claimSummaryTier } from './claim-response-summary';
import { ClaimSideResponders } from './claim-side-responders';

/**
 * Where opinion sits on a claim: one number, the split, and who is on each side.
 *
 * Scaled to the evidence, through the same `claimSummaryTier` every card reads — so the page and a
 * card describing the same claim cannot say different things about it.
 *
 * The tier matters most here, because this is where the number is loudest. A 40px "100%" is a
 * strong statement, and on the measured data it was usually standing on two responses: 93% of
 * answered claims are unanimous and only 2% reach the floor. Below the floor the module now reports
 * the tally at the weight a tally deserves and keeps the percentage out of it; at zero it invites a
 * first response rather than rendering nothing at all.
 */
export function ClaimVerdict({
  entityId,
  spaceId,
  responseKind,
  summary,
}: {
  entityId: string;
  spaceId: string;
  responseKind: ResponseKind;
  summary: ClaimResponseSummary;
}) {
  if (summary.isLoading) {
    return <Skeleton className="h-[132px] w-full rounded-lg" />;
  }

  const copy = ENTITY_RESPONSE_COPY[responseKind];
  const tier = claimSummaryTier(summary.total);

  // An invitation, where before there was nothing at all — and nothing is what the great majority
  // of claims render, so this is the state most readers meet.
  if (tier === 'invite') {
    return (
      <section aria-label="Response summary" className="rounded-lg border border-grey-02 bg-white p-4 @[560px]:p-5">
        <Text as="p" variant="metadataMedium" color="text">
          No responses yet
        </Text>
        <Text as="p" variant="metadata" color="grey-04" className="mt-1">
          Be the first to {copy.positiveAction.toLowerCase()} this claim.
        </Text>
      </section>
    );
  }

  // Answered, but not by enough people to characterise a split. Report the tally at the weight a
  // tally deserves: no bar, and above all no percentage, which would state a rate where there is
  // only a count.
  if (tier === 'counts') {
    return (
      <section aria-label="Response summary" className="rounded-lg border border-grey-02 bg-white p-4 @[560px]:p-5">
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
          <SideSummary
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
          <SideSummary
            swatchClassName="bg-red-01"
            label={copy.negativeAction}
            count={summary.negative}
            direction="negative"
            entityId={entityId}
            spaceId={spaceId}
            responseKind={responseKind}
            viewerDirection={summary.viewerDirection}
            viewerSpaceId={summary.viewerSpaceId}
            alignEnd
          />
        </div>
        <Text as="p" variant="footnote" color="grey-04" className="mt-3">
          {summary.total === 1 ? '1 response' : `${summary.total} responses`} so far — too few to call the split.
        </Text>
      </section>
    );
  }

  const percent = summary.percent ?? 0;

  return (
    <section aria-label="Response summary" className="rounded-lg border border-grey-02 bg-white p-4 @[560px]:p-5">
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
        {/* The share and what it is a share *of*, stacked — the number carries the emphasis and the
            verb sits under it, rather than the two competing on one baseline. */}
        <div className="flex flex-col">
          <span className="text-[2.5rem] leading-none font-semibold tracking-[-1px] tabular-nums">{percent}%</span>
          <Text as="span" variant="metadata" color="grey-04" className="mt-1">
            {/* "Agreements" → "agree", "Verifications" → "verify" reads wrong; use the action verb. */}
            {copy.positiveAction.toLowerCase()}
          </Text>
        </div>
        <div className="flex items-center gap-2">
          {summary.isControversial && (
            <span className="rounded-sm bg-orange/25 px-1.5 py-0.5 text-metadata font-medium text-text">
              Controversial
            </span>
          )}
          <Text as="span" variant="metadata" color="grey-04" className="tabular-nums">
            {summary.total} {summary.total === 1 ? 'response' : 'responses'}
          </Text>
        </div>
      </div>

      <div
        className="mt-4 flex h-2 overflow-hidden rounded-full bg-grey-01"
        role="img"
        aria-label={`${percent}% ${copy.positiveAction.toLowerCase()}, ${100 - percent}% ${copy.negativeAction.toLowerCase()}`}
      >
        <span className="bg-green" style={{ width: `${percent}%` }} />
        <span className="bg-red-01" style={{ width: `${100 - percent}%` }} />
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <SideSummary
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
        <SideSummary
          swatchClassName="bg-red-01"
          label={copy.negativeAction}
          count={summary.negative}
          direction="negative"
          entityId={entityId}
          spaceId={spaceId}
          responseKind={responseKind}
          viewerDirection={summary.viewerDirection}
          viewerSpaceId={summary.viewerSpaceId}
          alignEnd
        />
      </div>
    </section>
  );
}

/** One side of the split: its swatch, its count, and the people who took it. */
function SideSummary({
  swatchClassName,
  label,
  count,
  direction,
  entityId,
  spaceId,
  responseKind,
  viewerDirection,
  viewerSpaceId,
  alignEnd = false,
}: {
  swatchClassName: string;
  label: string;
  count: number;
  direction: 'positive' | 'negative';
  entityId: string;
  spaceId: string;
  responseKind: ResponseKind;
  viewerDirection: 'positive' | 'negative' | null;
  viewerSpaceId: string | null;
  alignEnd?: boolean;
}) {
  return (
    <div className={cx('flex min-w-0 items-center gap-2', alignEnd && 'justify-end')}>
      <span className={cx('size-2 shrink-0 rounded-xs', swatchClassName)} aria-hidden />
      <Text as="span" variant="metadataMedium" color="text" className="tabular-nums">
        {label} {count}
      </Text>
      {count > 0 && (
        <ClaimSideResponders
          entityId={entityId}
          spaceId={spaceId}
          responseKind={responseKind}
          direction={direction}
          label={label}
          totalResponders={count}
          viewerDirection={viewerDirection}
          viewerSpaceId={viewerSpaceId}
        />
      )}
    </div>
  );
}
