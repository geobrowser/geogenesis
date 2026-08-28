'use client';

import * as Popover from '@radix-ui/react-popover';

import * as React from 'react';

import cx from 'classnames';

import { ENTITY_RESPONSE_COPY, type ResponseKind } from '~/core/responses/entity-response';

import { Tag } from '~/design-system/tag';
import { Text } from '~/design-system/text';

import { ClaimResponderAvatars } from '~/partials/entity-page/claim-voter-avatars';
import { RespondersPopoverContent } from '~/partials/entity-page/entity-vote-buttons';

import { CLAIM_RESPONSE_OBJECT_TYPE, type ClaimResponseSummary, claimSummaryTier } from './claim-response-summary';

/**
 * Where opinion sits on a claim, scaled to the evidence behind it.
 *
 * The one place any card-sized surface reports a claim's responses, so the hub, the topic page, the
 * related-claims gallery and the explore feed cannot drift apart — and cannot disagree with the
 * claim page, which reads the same tier from the same helper.
 *
 * The three tiers are `claimSummaryTier`'s, and the reason they exist is written there. What this
 * adds is the shape of each: an invitation carries no bar, a tally carries no percentage, and only
 * a claim past the floor gets the full treatment.
 */
export function ClaimSummary({
  entityId,
  spaceId,
  responseKind,
  summary,
  className,
}: {
  entityId: string;
  spaceId: string;
  responseKind: ResponseKind;
  summary: ClaimResponseSummary;
  className?: string;
}) {
  const copy = ENTITY_RESPONSE_COPY[responseKind];
  const tier = claimSummaryTier(summary.total);

  // An invitation rather than a "0%", and the verb is the claim's own — "Be the first to verify it"
  // on a factual claim, "to agree" on an opinion.
  if (tier === 'invite') {
    return (
      <div className={className}>
        <Text as="p" variant="metadata" color="grey-04">
          Be the first to {copy.positiveAction.toLowerCase()} it.
        </Text>
      </div>
    );
  }

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

  return (
    <div className={className}>
      <div
        className="flex h-1.5 overflow-hidden rounded-full bg-grey-01"
        role="img"
        aria-label={`${percent}% ${copy.positiveAction.toLowerCase()}, ${100 - percent}% ${copy.negativeAction.toLowerCase()}`}
      >
        <span className="bg-green" style={{ width: `${percent}%` }} />
        <span className="bg-red-01" style={{ width: `${100 - percent}%` }} />
      </div>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <span className="flex items-center gap-1.5">
          <Text as="span" variant="metadataMedium" color="text" className="tabular-nums">
            {percent}%
          </Text>
          <Text as="span" variant="metadata" color="grey-04">
            {copy.positiveAction.toLowerCase()}
          </Text>
        </span>
        {responders}
      </div>
    </div>
  );
}

/**
 * A claim the responses are genuinely split over.
 *
 * Lives beside the space chip rather than down in the summary: it says what *kind* of claim this is,
 * which is the question the meta row answers, and it is the one thing on a claim card worth
 * spotting from across a list. Built on the design system's `Tag` so it matches every other tag in
 * the product — it was a hand-rolled span at a size the scale does not contain.
 *
 * Only ever rendered past the response floor, because "contested" off two responses is not a fact
 * about the claim, it is a fact about how few people have read it.
 */
export function ControversialTag({ className }: { className?: string }) {
  return <Tag className={cx('bg-orange/25 text-text', className)}>Controversial</Tag>;
}

/**
 * The people who responded, as one control rather than two things that happen to sit together.
 *
 * Faces and count were already on screen and already fetched; what they lacked was somewhere to
 * go. The list behind this is the entity page's own — sectioned by side — so pressing it answers
 * the question the faces raise, which is not "how many" but "who, and on which side".
 *
 * Distinct from the faces inside the position pills, deliberately: those are people standing
 * *ready to argue* a side, a viewer-relative offer. These are people who *responded*, a fact about
 * the claim. Two populations, two places, so neither has to be explained.
 */
export function ClaimResponders({
  entityId,
  spaceId,
  responseKind,
  summary,
  label,
}: {
  entityId: string;
  spaceId: string;
  responseKind: ResponseKind;
  summary: ClaimResponseSummary;
  label: string;
}) {
  const [open, setOpen] = React.useState(false);

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button
          type="button"
          title={label}
          aria-label={label}
          className="flex shrink-0 items-center rounded transition-opacity hover:opacity-80"
        >
          <ClaimResponderAvatars
            entityId={entityId}
            spaceId={spaceId}
            objectType={CLAIM_RESPONSE_OBJECT_TYPE}
            responseKind={responseKind}
            totalResponders={summary.total}
            viewerSpaceId={summary.viewerSpaceId}
            optimisticViewerResponse={summary.viewerDirection}
          />
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="end"
          side="bottom"
          sideOffset={8}
          className="z-100 w-[200px] overflow-hidden rounded-lg border border-grey-02 bg-white shadow-lg"
        >
          <RespondersPopoverContent
            entityId={entityId}
            spaceId={spaceId}
            objectType={CLAIM_RESPONSE_OBJECT_TYPE}
            responseKind={responseKind}
          />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
