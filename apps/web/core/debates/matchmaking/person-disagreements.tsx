'use client';

import * as Popover from '@radix-ui/react-popover';

import * as React from 'react';

import { type SpaceLabel, spaceLabel } from '~/core/hooks/use-space-labels';
import { responsePositionLabel } from '~/core/responses/entity-response';
import { normId } from '~/core/utils/norm-id';
import { NavUtils } from '~/core/utils/utils';

import { ChevronDownSmall } from '~/design-system/icons/chevron-down-small';
import { ResponsePositionIcon } from '~/design-system/icons/response-position-icon';
import { PrefetchLink as Link } from '~/design-system/prefetch-link';

import type { ClaimMatch } from './disagreement-counts';
import { PersonSpaceIcon } from './person-space-icons';

export function PersonMatches({
  personName,
  matches,
  claimNamesById,
  claimNamesLoading,
  labelsById,
  popoverPortal,
}: {
  personName: string;
  matches: ClaimMatch[];
  claimNamesById: ReadonlyMap<string, string | null>;
  claimNamesLoading: boolean;
  labelsById: Map<string, SpaceLabel>;
  popoverPortal: HTMLElement | null;
}) {
  const firstClaimRef = React.useRef<HTMLAnchorElement>(null);
  const count = matches.length;
  if (count === 0) return null;

  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <button
          type="button"
          aria-label={`View ${count} matching ${count === 1 ? 'claim' : 'claims'} with ${personName}`}
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
            hideWhenDetached
            aria-label={`Matching claims with ${personName}`}
            onOpenAutoFocus={event => {
              event.preventDefault();
              firstClaimRef.current?.focus();
            }}
            className="z-100 w-[320px] max-w-[calc(100vw-32px)] overflow-hidden rounded-lg border border-grey-02 bg-white shadow-lg"
          >
            <p className="border-b border-grey-02 bg-grey-01 px-3 py-2 text-footnoteMedium text-grey-04">
              <span className="text-text tabular-nums">{count}</span> {count === 1 ? 'match' : 'matches'} with{' '}
              <span className="text-text">{personName}</span>
            </p>
            <ul
              aria-label={`Matching claims with ${personName}`}
              className="m-0 max-h-[320px] list-none overflow-y-auto overscroll-contain p-0"
            >
              {matches.map((match, index) => {
                const name = claimName(match.claimId, claimNamesById, claimNamesLoading);
                const space = spaceLabel(labelsById, match.spaceId);
                return (
                  <li
                    key={`${normId(match.claimId)}:${normId(match.spaceId)}`}
                    className="border-t border-grey-02 first:border-t-0"
                  >
                    <Link
                      ref={index === 0 ? firstClaimRef : undefined}
                      href={NavUtils.toEntity(match.spaceId, match.claimId)}
                      className="block px-3 py-2.5 transition-colors duration-75 hover:bg-grey-01 focus-visible:bg-grey-01 focus-visible:outline-none"
                    >
                      <span className="mb-1 flex min-w-0 items-center gap-1.5 text-footnoteMedium text-grey-04">
                        <PersonSpaceIcon spaceId={match.spaceId} labelsById={labelsById} size={12} />
                        <span className="truncate">{space?.name?.trim() || 'Space'}</span>
                      </span>
                      <span className="block text-metadataMedium text-text">{name}</span>
                      <span className="mt-2 flex items-center gap-1.5">
                        <PositionBadge actor="You" responseKind={match.responseKind} position={match.viewerPosition} />
                        <span className="shrink-0 text-footnote text-grey-03" aria-hidden>
                          vs
                        </span>
                        <PositionBadge
                          actor={personName}
                          responseKind={match.responseKind}
                          position={match.personPosition}
                        />
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </Popover.Content>
        </Popover.Portal>
      ) : null}
    </Popover.Root>
  );
}

/**
 * Names a claim without confusing missing metadata with an entity whose name is genuinely empty.
 *
 * `Map#get` alone cannot distinguish those cases because both return a nullish value. Presence in
 * the map means the entity loaded successfully, so only that case earns the "Untitled" fallback;
 * a settled lookup with no entity covers both a failed batch and a successfully missing entity.
 */
function claimName(
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
