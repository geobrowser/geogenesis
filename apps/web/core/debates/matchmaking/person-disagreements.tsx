'use client';

import * as Popover from '@radix-ui/react-popover';

import * as React from 'react';

import cx from 'classnames';

import { useClaimMatchup } from '~/core/claims/browse/use-claim-matchup';
import { type SpaceLabel, spaceLabel } from '~/core/hooks/use-space-labels';
import { responsePositionLabel } from '~/core/responses/entity-response';
import { normId } from '~/core/utils/norm-id';
import { NavUtils } from '~/core/utils/utils';

import { ChevronDownSmall } from '~/design-system/icons/chevron-down-small';
import { ResponsePositionIcon } from '~/design-system/icons/response-position-icon';
import { PrefetchLink as Link } from '~/design-system/prefetch-link';

import { RequestDebateControl } from '../request-debate-control';
import type { ClaimMatch } from './disagreement-counts';
import { debateActionAnalyticsAttributes } from './hub-analytics';
import { HUB_EYEBROW_CLASS_NAME } from './hub-eyebrow';
import { PersonSpaceIcon } from './person-space-icons';

/**
 * "Debate on this" under each claim (GEO-3463), offered while the person is online. It sends an
 * ordinary claim request for that claim, which geo-chat fans out to the people who hold the other
 * side, this person among them.
 */
export type PersonMatchesDebate = {
  /** Why every button waits, when the row's own Debate now would: a request out, a debate on. */
  pausedReason?: string | null;
  /** The request went out; the row closes the list, since the strip now has it. */
  onRequested: () => void;
};

export function PersonMatches({
  personName,
  matches,
  claimNamesById,
  claimNamesLoading,
  labelsById,
  popoverPortal,
  triggerAttributes,
  hideWhenDetached = true,
  open,
  onOpenChange,
  debate,
  compact = false,
}: {
  personName: string;
  matches: ClaimMatch[];
  claimNamesById: ReadonlyMap<string, string | null>;
  claimNamesLoading: boolean;
  labelsById: Map<string, SpaceLabel>;
  popoverPortal: HTMLElement | null;
  /** Analytics attributes for the trigger, where its surface labels its own clicks (GEO-3220). */
  triggerAttributes?: Readonly<Record<`data-${string}`, string>>;
  /** Off when the row sits inside another popover; see `PersonRow`'s `hidePopoversWhenDetached`. */
  hideWhenDetached?: boolean;
  /** Controlled by the panel row, so its hover card can stay shut while this is open. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  debate?: PersonMatchesDebate;
  /**
   * The side panel's list (GEO-3463, the prototype's matches popover): one tight row per claim —
   * its name, then "You: Agree · Ana: Disagree" — with "Debate on this" beside it. The calendar and
   * the full row keep the fuller layout with each side as a badge.
   */
  compact?: boolean;
}) {
  const firstClaimRef = React.useRef<HTMLAnchorElement>(null);
  const count = matches.length;
  if (count === 0) return null;

  return (
    <Popover.Root open={open} onOpenChange={onOpenChange}>
      <Popover.Trigger asChild>
        <button
          type="button"
          aria-label={`View ${count} matching ${count === 1 ? 'claim' : 'claims'} with ${personName}`}
          {...triggerAttributes}
          className="inline-flex items-center gap-1 whitespace-nowrap text-purple transition-opacity hover:opacity-75 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-purple"
        >
          <span className="tabular-nums">{count}</span> {count === 1 ? 'match' : 'matches'}
          <ChevronDownSmall />
        </button>
      </Popover.Trigger>
      {popoverPortal ? (
        <Popover.Portal container={popoverPortal}>
          <Popover.Content
            side="bottom"
            align="start"
            sideOffset={8}
            collisionPadding={{ top: 52, right: 16, bottom: 16, left: 16 }}
            hideWhenDetached={hideWhenDetached}
            aria-label={`Matching claims with ${personName}`}
            onOpenAutoFocus={event => {
              event.preventDefault();
              firstClaimRef.current?.focus();
            }}
            className={cx(
              'z-100 w-[320px] max-w-[calc(100vw-32px)] overflow-hidden rounded-lg border border-grey-02 bg-white shadow-lg',
              compact && 'p-1.5'
            )}
          >
            {compact ? (
              <>
                <p className={cx('m-0 px-2 pt-1 pb-1.5', HUB_EYEBROW_CLASS_NAME)}>
                  {count} {count === 1 ? 'match' : 'matches'} with {personName}
                </p>
                <ul
                  aria-label={`Matching claims with ${personName}`}
                  className="m-0 max-h-[260px] list-none overflow-y-auto overscroll-contain p-0"
                >
                  {matches.map((match, index) => (
                    <li
                      key={`${normId(match.claimId)}:${normId(match.spaceId)}`}
                      className="flex items-start gap-2 rounded-lg p-2 transition-colors hover:bg-grey-01"
                    >
                      <CompactMatchingClaim
                        ref={index === 0 ? firstClaimRef : undefined}
                        match={match}
                        personName={personName}
                        claimNamesById={claimNamesById}
                        claimNamesLoading={claimNamesLoading}
                      />
                      {debate ? <DebateOnThis match={match} debate={debate} /> : null}
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <>
                <p className="border-b border-grey-02 bg-grey-01 px-3 py-2 text-footnoteMedium text-grey-04">
                  <span className="text-text tabular-nums">{count}</span> {count === 1 ? 'match' : 'matches'} with{' '}
                  <span className="text-text">{personName}</span>
                </p>
                <ul
                  aria-label={`Matching claims with ${personName}`}
                  className="m-0 max-h-[320px] list-none overflow-y-auto overscroll-contain p-0"
                >
                  {matches.map((match, index) => (
                    <li
                      key={`${normId(match.claimId)}:${normId(match.spaceId)}`}
                      className="border-t border-grey-02 first:border-t-0"
                    >
                      <MatchingClaim
                        ref={index === 0 ? firstClaimRef : undefined}
                        match={match}
                        viewerName="You"
                        personName={personName}
                        claimNamesById={claimNamesById}
                        claimNamesLoading={claimNamesLoading}
                        labelsById={labelsById}
                        className="px-3 py-2.5"
                      />
                      {/* A sibling of the link, never inside it: a button nested in an anchor is invalid
                      and its press would also follow the link. */}
                      {debate ? (
                        <div className="flex justify-end px-3 pb-2.5">
                          <DebateOnThis match={match} debate={debate} />
                        </div>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </>
            )}
          </Popover.Content>
        </Popover.Portal>
      ) : null}
    </Popover.Root>
  );
}

/**
 * A claim in the panel's compact list: its name, linked to the claim, and each side in words.
 */
const CompactMatchingClaim = React.forwardRef<
  HTMLAnchorElement,
  {
    match: ClaimMatch;
    personName: string;
    claimNamesById: ReadonlyMap<string, string | null>;
    claimNamesLoading: boolean;
  }
>(function CompactMatchingClaim({ match, personName, claimNamesById, claimNamesLoading }, ref) {
  const firstName = personName.split(' ')[0] || personName;
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-0.5">
      <Link
        ref={ref}
        href={NavUtils.toEntity(match.spaceId, match.claimId)}
        className="text-breadcrumb font-medium text-text hover:underline focus-visible:underline focus-visible:outline-none"
      >
        {claimName(match.claimId, claimNamesById, claimNamesLoading)}
      </Link>
      <span className="text-browseSection text-grey-04">
        You: {responsePositionLabel(match.viewerPosition)} · {firstName}: {responsePositionLabel(match.personPosition)}
      </span>
    </div>
  );
});

/**
 * One claim's "Debate on this": the same request, blocked reasons and error handling as a claim
 * card's offer (`useClaimMatchup`), so an unavailable viewer is told why, a response geo-chat has not
 * caught up with is recovered, and a refusal is shown rather than the button quietly going idle.
 */
function DebateOnThis({ match, debate }: { match: ClaimMatch; debate: PersonMatchesDebate }) {
  const { blockedReason, isRequesting, requestError, request } = useClaimMatchup({
    claimId: match.claimId,
    spaceId: match.spaceId,
    viewerPosition: match.viewerPosition,
  });
  const reason = debate.pausedReason ?? blockedReason ?? null;

  // A request that went out and was not refused is now the strip's, so the list makes way for it.
  const { onRequested } = debate;
  const wasRequesting = React.useRef(false);
  React.useEffect(() => {
    if (wasRequesting.current && !isRequesting && !requestError) onRequested();
    wasRequesting.current = isRequesting;
  }, [isRequesting, onRequested, requestError]);

  return (
    <RequestDebateControl
      onRequest={request}
      label="Debate on this"
      tone="secondary"
      disabled={Boolean(reason)}
      isRequesting={isRequesting}
      blockedReason={reason}
      requestError={requestError}
      analytics={debateActionAnalyticsAttributes('hub', 'Debate on this', 'start_debate')}
    />
  );
}

/**
 * One claim a pair holds opposite positions on: its space, its name, and each side. Shared by the
 * People tab's matches popover and admin New match's inline list (GEO-3230), so a match reads the
 * same wherever it is listed. `newTab` keeps a half-built admin match open behind the claim page.
 */
export const MatchingClaim = React.forwardRef<
  HTMLAnchorElement,
  {
    match: ClaimMatch;
    /** Who holds `viewerPosition`: "You" on the People tab, debater 1 in New match. */
    viewerName: string;
    personName: string;
    claimNamesById: ReadonlyMap<string, string | null>;
    claimNamesLoading: boolean;
    labelsById: Map<string, SpaceLabel>;
    newTab?: boolean;
    className?: string;
  }
>(function MatchingClaim(
  { match, viewerName, personName, claimNamesById, claimNamesLoading, labelsById, newTab, className },
  ref
) {
  const name = claimName(match.claimId, claimNamesById, claimNamesLoading);
  const space = spaceLabel(labelsById, match.spaceId);
  return (
    <Link
      ref={ref}
      href={NavUtils.toEntity(match.spaceId, match.claimId)}
      {...(newTab ? { target: '_blank', rel: 'noreferrer' } : {})}
      className={cx(
        'block transition-colors duration-75 hover:bg-grey-01 focus-visible:bg-grey-01 focus-visible:outline-none',
        className
      )}
    >
      <span className="mb-1 flex min-w-0 items-center gap-1.5 text-footnoteMedium text-grey-04">
        <PersonSpaceIcon spaceId={match.spaceId} labelsById={labelsById} size={12} />
        <span className="truncate">{space?.name?.trim() || 'Space'}</span>
      </span>
      <span className="block text-metadataMedium text-text">{name}</span>
      <span className="mt-2 flex items-center gap-1.5">
        <PositionBadge actor={viewerName} responseKind={match.responseKind} position={match.viewerPosition} />
        <span className="shrink-0 text-footnote text-grey-03" aria-hidden>
          vs
        </span>
        <PositionBadge actor={personName} responseKind={match.responseKind} position={match.personPosition} />
      </span>
    </Link>
  );
});

/**
 * Names a claim without confusing missing metadata with an entity whose name is genuinely empty.
 *
 * `Map#get` alone cannot distinguish those cases because both return a nullish value. Presence in
 * the map means the entity loaded successfully, so only that case earns the "Untitled" fallback;
 * a settled lookup with no entity covers both a failed batch and a successfully missing entity.
 */
export function claimName(
  claimId: string,
  claimNamesById: ReadonlyMap<string, string | null>,
  claimNamesLoading: boolean
): string {
  const normalizedId = normId(claimId);
  if (claimNamesById.has(normalizedId)) return claimNamesById.get(normalizedId)?.trim() || 'Untitled claim';
  return claimNamesLoading ? 'Loading claim…' : 'Claim unavailable';
}

function PositionBadge({
  actor,
  responseKind,
  position,
}: {
  actor: string;
  responseKind: ClaimMatch['responseKind'];
  position: boolean;
}) {
  const action = responsePositionLabel(position);

  return (
    <span className="inline-flex min-w-0 flex-1 items-center gap-1.5 rounded-full border border-transparent bg-divider px-2 py-1 text-footnote">
      <span className="shrink-0 text-text" aria-hidden>
        <ResponsePositionIcon responseKind={responseKind} position={position} selected />
      </span>
      <span className="flex min-w-0 items-center gap-1">
        <span className="min-w-0 truncate text-grey-04">{actor}:</span>
        <span className="shrink-0 font-medium text-text">{action}</span>
      </span>
    </span>
  );
}
