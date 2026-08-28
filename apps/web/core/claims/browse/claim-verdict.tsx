'use client';

import * as React from 'react';

import { ENTITY_RESPONSE_COPY, type ResponseKind } from '~/core/responses/entity-response';

import { Skeleton } from '~/design-system/skeleton';
import { Text } from '~/design-system/text';

import { type ClaimResponseSummary, claimSummaryTier } from './claim-response-summary';
import { ClaimSideSummary } from './claim-summary';

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

  const percent = summary.percent ?? 0;

  return (
    <section aria-label="Response summary" className="rounded-lg border border-grey-02 bg-white p-4 @[560px]:p-5">
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
        {/* The share and what it is a share *of*, on one baseline. They were stacked, which gave the
            verb a line of its own for one small word and pushed everything under it down. Sharing a
            line reads as one statement — "68% agree" — which is what it is, and it matches the
            explore card exactly. */}
        <span className="flex items-baseline gap-1.5">
          <span className="text-[2.5rem] leading-none font-semibold tracking-[-1px] tabular-nums">{percent}%</span>
          <Text as="span" variant="metadata" color="grey-04">
            {/* "Agreements" → "agree", "Verifications" → "verify" reads wrong; use the action verb. */}
            {copy.positiveAction.toLowerCase()}
          </Text>
        </span>
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
          alignEnd
        />
      </div>
    </section>
  );
}
