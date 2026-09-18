'use client';

import * as Popover from '@radix-ui/react-popover';

import * as React from 'react';

import { type SpaceLabel, spaceLabel } from '~/core/hooks/use-space-labels';
import { normId } from '~/core/utils/norm-id';
import { getSpaceRank } from '~/core/utils/space/space-ranking';
import { NavUtils } from '~/core/utils/utils';

import { ThumbGeoImage } from '~/design-system/geo-image';
import { PrefetchLink as Link } from '~/design-system/prefetch-link';

/** The same three-face cap used by the app's other compact avatar stacks. */
export const PERSON_SPACE_ICON_CAP = 3;

/**
 * Debate activity wins first, then the app's canonical space rank. The id tie-break keeps the
 * unranked tail stable even when GraphQL returns memberships in a different order.
 */
export function orderPersonSpaces(
  spaceIds: string[],
  debatesBySpace: ReadonlyMap<string, number> = new Map()
): string[] {
  const normalizedDebateCounts = new Map(
    [...debatesBySpace].map(([spaceId, count]) => [normId(spaceId), count] as const)
  );

  return [...spaceIds].sort((left, right) => {
    const leftCount = normalizedDebateCounts.get(normId(left)) ?? 0;
    const rightCount = normalizedDebateCounts.get(normId(right)) ?? 0;
    if (leftCount !== rightCount) return rightCount - leftCount;

    const rankDifference = getSpaceRank(left) - getSpaceRank(right);
    if (rankDifference !== 0) return rankDifference;

    return normId(left).localeCompare(normId(right));
  });
}

/**
 * A person's active spaces, using the app's overlapping avatar + overflow pattern. The stack is a
 * button because its full answer is useful: opening it lists every space in the same order, with
 * recorded-debate counts explaining why an active space leads the list.
 */
export function PersonSpaceIcons({
  spaceIds,
  labelsById,
  debatesBySpace = new Map(),
  popoverPortal,
}: {
  spaceIds: string[];
  labelsById: Map<string, SpaceLabel>;
  debatesBySpace?: ReadonlyMap<string, number>;
  popoverPortal: HTMLElement | null;
}) {
  const orderedSpaceIds = React.useMemo(() => orderPersonSpaces(spaceIds, debatesBySpace), [spaceIds, debatesBySpace]);

  if (orderedSpaceIds.length === 0) return null;

  const shown = orderedSpaceIds.slice(0, PERSON_SPACE_ICON_CAP);
  const overflow = orderedSpaceIds.length - shown.length;

  return (
    <div className="flex min-w-0 items-center gap-1.5 text-footnote text-grey-04">
      <span className="shrink-0">Active in</span>
      <Popover.Root>
        <Popover.Trigger asChild>
          <button
            type="button"
            aria-label={`View ${orderedSpaceIds.length} active ${orderedSpaceIds.length === 1 ? 'space' : 'spaces'}`}
            className="inline-flex shrink-0 items-center rounded-sm transition-opacity hover:opacity-80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ctaPrimary"
          >
            <span aria-hidden="true" className="flex items-center -space-x-2">
              {shown.map(spaceId => (
                <StackedSpaceIcon key={spaceId} spaceId={spaceId} labelsById={labelsById} />
              ))}
              {overflow > 0 ? (
                <span
                  className="relative box-content flex h-3 min-w-3 shrink-0 items-center justify-center rounded-full border-2 border-white bg-grey-02 px-1 text-[9px] leading-3 text-grey-04 tabular-nums"
                  data-testid="person-space-overflow"
                >
                  +{overflow}
                </span>
              ) : null}
            </span>
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
              onOpenAutoFocus={event => event.preventDefault()}
              className="z-100 w-[200px] overflow-hidden rounded-lg border border-grey-02 bg-white shadow-lg"
            >
              <p className="px-3 pt-2.5 pb-1.5 text-footnoteMedium text-grey-04">Active in</p>
              <ul
                aria-label="Active spaces"
                className="m-0 max-h-[356px] list-none overflow-y-auto overscroll-contain p-0"
              >
                {orderedSpaceIds.map(spaceId => {
                  const label = spaceLabel(labelsById, spaceId);
                  const name = label?.name?.trim() || 'Space';
                  const debateCount = debatesBySpace.get(normId(spaceId)) ?? debatesBySpace.get(spaceId) ?? 0;

                  return (
                    <li key={spaceId}>
                      <Link
                        href={NavUtils.toSpace(spaceId)}
                        className="flex min-w-0 items-center gap-2 px-3 py-1.5 transition-colors duration-75 hover:bg-grey-01"
                        data-testid="person-space-option"
                      >
                        <SpaceListIcon spaceId={spaceId} labelsById={labelsById} />
                        <span className="min-w-0 flex-1 truncate text-metadataMedium text-text">{name}</span>
                        {debateCount > 0 ? (
                          <span className="shrink-0 text-footnote text-grey-04 tabular-nums">
                            {debateCount} {debateCount === 1 ? 'debate' : 'debates'}
                          </span>
                        ) : null}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </Popover.Content>
          </Popover.Portal>
        ) : null}
      </Popover.Root>
    </div>
  );
}

function StackedSpaceIcon({ spaceId, labelsById }: { spaceId: string; labelsById: Map<string, SpaceLabel> }) {
  const label = spaceLabel(labelsById, spaceId);
  const name = label?.name?.trim() || 'Space';

  return (
    <span
      title={name}
      className="relative box-content flex h-3 w-3 shrink-0 items-center justify-center overflow-hidden rounded-full border-2 border-white bg-grey-01 text-[8px] font-medium text-grey-04"
      data-testid="person-space-icon"
    >
      {label?.image ? <ThumbGeoImage value={label.image} alt="" /> : spaceInitial(name)}
    </span>
  );
}

function SpaceListIcon({ spaceId, labelsById }: { spaceId: string; labelsById: Map<string, SpaceLabel> }) {
  const label = spaceLabel(labelsById, spaceId);
  const name = label?.name?.trim() || 'Space';

  return (
    <span
      aria-hidden="true"
      className="relative flex h-5 w-5 shrink-0 items-center justify-center overflow-hidden rounded-full bg-grey-01 text-footnoteMedium font-medium text-grey-04"
    >
      {label?.image ? <ThumbGeoImage value={label.image} alt="" /> : spaceInitial(name)}
    </span>
  );
}

function spaceInitial(name: string): string {
  return (name.slice(0, 1).toUpperCase() || '?').replace(/[^A-Z0-9?]/g, '?');
}
