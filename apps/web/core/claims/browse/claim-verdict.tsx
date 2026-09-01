'use client';

import * as React from 'react';

import { ENTITY_RESPONSE_COPY, type ResponseKind } from '~/core/responses/entity-response';

import { Skeleton } from '~/design-system/skeleton';
import { Text } from '~/design-system/text';

import { type ClaimResponseSummary, claimSummaryTier } from './claim-response-summary';
import { ClaimSides, ClaimSplitBar } from './claim-summary';

/**
 * Where opinion sits on a claim: one number, the split, and who is on each side.
 *
 * Reads the same `claimSummaryTier` every card reads, so the page and a card describing the same
 * claim cannot say different things about it.
 *
 * At zero it invites a first response rather than rendering nothing at all, which is what it used
 * to do on the state most claims are in — but only at a zero the server actually reported. A zero
 * standing in for a failed or unasked question renders nothing, because the invitation is an
 * assertion about the claim and those two are not. From the first response the share is shown, however small
 * the sample: 93% of answered claims are unanimous and the median has two responses, so a "100%"
 * here is usually standing on very little — and what keeps that honest is the responder counts
 * directly beneath it, not withholding the number.
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

  // Nothing, where the counts never answered.
  //
  // `total: 0` is also what a failed count query and a held-back hook produce, and this module is
  // the one place that turns a zero into a *claim about the world* — "No responses yet", followed
  // by an invitation to be the first. Said over a claim with two hundred responses that is not a
  // missing verdict but a wrong one, and the reader has no way to tell. On the claim page the
  // held-back case is reached on every load: the summary waits for the vocabulary, so until the
  // entity lands there is a window where nothing is loading and nothing has been asked.
  //
  // Rendering nothing is what this did before it learned to invite, and it is the honest answer to
  // a question that was never put.
  if (!summary.hasCounts) return null;

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
          {copy.firstResponsePrompt}
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
        {/* No Controversial tag here: it moved up to the hero chips, beside the type and tags, where
            it says what kind of claim this is. Flagging it in both places said it twice. */}
        <Text as="span" variant="metadata" color="grey-04" className="tabular-nums">
          {summary.total} {summary.total === 1 ? 'response' : 'responses'}
        </Text>
      </div>

      <ClaimSplitBar percent={percent} responseKind={responseKind} className="mt-4 h-2" />

      <ClaimSides
        entityId={entityId}
        spaceId={spaceId}
        responseKind={responseKind}
        summary={summary}
        className="mt-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-2"
        alignSecondEnd
      />
    </section>
  );
}
