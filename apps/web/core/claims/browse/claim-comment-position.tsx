'use client';

import * as React from 'react';

import cx from 'classnames';

import type { DebateResponseKind } from '~/core/debates/api';
import { uuidToHex } from '~/core/id/normalize';
import {
  type ActiveResponseDirection,
  resolveEntityResponseKind,
  responsePositionLabel,
} from '~/core/responses/entity-response';
import { useEntityResponders } from '~/core/responses/use-entity-responders';
import { useQueryEntity } from '~/core/sync/use-store';

import { CLAIM_RESPONSE_OBJECT_TYPE, useClaimResponseSummary } from './claim-response-summary';

type ClaimCommentPositionContextValue = {
  directions: Map<string, ActiveResponseDirection>;
  responseKind: DebateResponseKind;
  /**
   * What the badge is a position *on*, for the hover title.
   *
   * A bare "Agree" beside a name answers a question the reader has to guess at, and the guess is
   * whatever claim is nearest on screen. Naming it removes the guess.
   */
  claimName: string | null;
};

const ClaimCommentPositionContext = React.createContext<ClaimCommentPositionContextValue | null>(null);

/**
 * Adds claim response context to a generic comments surface when its target is a claim.
 *
 * Entity comments panels can open for any entity, so their host cannot know whether to provide
 * Agree/Disagree or Verify/Dispute data. Resolve that once at the panel boundary instead of making
 * either of the comment header variants fetch it independently. Non-claims leave the generic
 * comment thread untouched, and claim pages that already own this state can keep using the
 * lower-level provider directly.
 */
export function ClaimCommentPositionBoundary({
  entityId,
  spaceId,
  children,
}: {
  entityId: string;
  spaceId: string;
  children: React.ReactNode;
}) {
  const { entity } = useQueryEntity({ id: entityId, spaceId });
  const responseKind = resolveEntityResponseKind(entity, spaceId);
  const summary = useClaimResponseSummary(entityId, spaceId, responseKind, responseKind !== 'curation');

  if (responseKind === 'curation') return children;

  return (
    <ClaimCommentPositionProvider
      entityId={entityId}
      spaceId={spaceId}
      responseKind={responseKind}
      claimName={entity?.name ?? null}
      viewerDirection={summary.viewerDirection}
      viewerSpaceId={summary.viewerSpaceId}
      isViewerResponseLoading={summary.isViewerResponseLoading}
    >
      {children}
    </ClaimCommentPositionProvider>
  );
}

/**
 * Makes the current position of each claim commenter available to the generic comment rows.
 *
 * The responder query is the same one the claim verdict already uses, so this normally reads a
 * warm cache rather than adding another request. The viewer's optimistic direction wins over that
 * indexed list so their newly posted explanation carries the side they just selected immediately.
 */
export function ClaimCommentPositionProvider({
  entityId,
  spaceId,
  responseKind,
  claimName,
  viewerDirection,
  viewerSpaceId,
  isViewerResponseLoading,
  children,
}: {
  entityId: string;
  spaceId: string;
  responseKind: DebateResponseKind;
  /**
   * The claim these positions are about, for the badge's hover title.
   *
   * Required rather than defaulted, and `null` only where there is genuinely no name to give. It was
   * optional, and the page-level provider then silently left it out — so the badge explained itself on
   * comments under an extracted claim and said nothing on the claim's own top-level comments, which is
   * the case the title was added for. A default is what let one of two call sites forget.
   */
  claimName: string | null;
  viewerDirection: ActiveResponseDirection | null;
  viewerSpaceId: string | null;
  /** True until the viewer read succeeds; failures stay unresolved rather than becoming a clear. */
  isViewerResponseLoading: boolean;
  children: React.ReactNode;
}) {
  // A non-null direction can be an in-flight optimistic response and remains authoritative while
  // the indexed viewer query is unresolved. Null needs the extra state: after a successful read it
  // means an explicit clear, but while loading (or after failure) it means "unknown" and must not
  // remove the viewer from the independently indexed responder list.
  const viewerResponseOverlay = viewerDirection ?? (isViewerResponseLoading ? undefined : null);
  const { responders } = useEntityResponders({
    entityId,
    spaceId,
    objectType: CLAIM_RESPONSE_OBJECT_TYPE,
    responseKind,
    viewerSpaceId,
    optimisticViewerResponse: viewerResponseOverlay,
  });

  const directions = React.useMemo(() => {
    const result = new Map<string, ActiveResponseDirection>();
    for (const responder of responders) {
      result.set(uuidToHex(responder.userId), responder.direction);
    }
    return result;
  }, [responders]);

  const value = React.useMemo(() => ({ directions, responseKind, claimName }), [claimName, directions, responseKind]);

  return <ClaimCommentPositionContext.Provider value={value}>{children}</ClaimCommentPositionContext.Provider>;
}

/**
 * Which side somebody is on, in the claim's own vocabulary — Agree/Disagree or Verify/Dispute.
 *
 * Shared by the comment rows, where it reports the author's current response, and by the extracted
 * claim rows, where it reports the side the debater argued. Two different facts wearing one badge on
 * purpose: to a reader scanning the thread they are the same question, and the tag that answers it
 * should not change shape depending on which kind of row it sits on.
 */
export function ResponsePositionTag({
  responseKind,
  position,
  title,
}: {
  responseKind: DebateResponseKind;
  position: boolean;
  /** Says what the position is *on*, which the word alone cannot. */
  title?: string;
}) {
  return (
    <span
      title={title}
      className={cx(
        'inline-flex shrink-0 items-center rounded-xs px-1 py-px text-[0.6875rem] font-medium text-text',
        position ? 'bg-successTertiary' : 'bg-errorTertiary'
      )}
    >
      {responsePositionLabel(responseKind, position)}
    </span>
  );
}

/**
 * Where this person stands on the claim their comment hangs under.
 *
 * "The claim their comment hangs under" rather than "the claim at the top of the page", and the
 * difference is not pedantic. A comment on an extracted claim sits directly below that claim's
 * sentence, so a bare "Agree" beside the author's name reads as agreement with *that* — and the page
 * claim it actually reported can be the opposite side, several screens up. Observed on testnet: a
 * comment arguing against an extracted claim, badged "Agree", because its author agrees with the
 * page claim the debate was about.
 *
 * The rule is now one sentence with no special cases: the badge reports the nearest claim above the
 * comment. Under an extracted claim that is the extracted claim; under a debate, or at the top of
 * the thread, there is no nearer claim and it stays the page's. Nesting the provider is all it takes,
 * because the badge reads whichever one is closest.
 *
 * Nothing is borrowed from further away when the person holds no position on the nearer claim: an
 * absent badge says less than a wrong one.
 */
export function ClaimCommentPositionBadge({ authorSpaceId }: { authorSpaceId: string }) {
  const context = React.useContext(ClaimCommentPositionContext);
  const direction = context?.directions.get(uuidToHex(authorSpaceId));
  if (!context || !direction) return null;

  const label = responsePositionLabel(context.responseKind, direction === 'positive');

  return (
    <ResponsePositionTag
      responseKind={context.responseKind}
      position={direction === 'positive'}
      title={context.claimName ? `${label}: ${context.claimName}` : undefined}
    />
  );
}
