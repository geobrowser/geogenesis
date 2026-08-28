'use client';

import * as Popover from '@radix-ui/react-popover';
import { useQuery } from '@tanstack/react-query';

import * as React from 'react';

import { Effect } from 'effect';
import pluralize from 'pluralize';

import { getEntityResponders } from '~/core/io/queries';
import { fetchProfilesBySpaceIds } from '~/core/io/subgraph/fetch-profile';
import {
  type ActiveResponseDirection,
  type ResponseKind,
  entityRespondersQueryKey,
} from '~/core/responses/entity-response';

import { Skeleton } from '~/design-system/skeleton';

import { RankingAggregatedSubmitterAvatars } from '~/partials/blocks/table/ranking-period-metadata';
import { MemberRow } from '~/partials/space-page/space-member-row';

import { CLAIM_RESPONSE_OBJECT_TYPE } from './claim-response-summary';

/**
 * Long enough to cross the gap between the trigger and the panel without the panel vanishing
 * mid-reach, short enough that it doesn't linger once the pointer has genuinely left.
 */
const CLOSE_GRACE_MS = 120;

/**
 * The people on one side of a claim: a stack of faces that opens the full list.
 *
 * `ClaimResponderAvatars` reports everyone who responded regardless of direction, which is right
 * for a single stack beside a score and wrong under a split — used on both sides it shows the same
 * people agreeing and disagreeing. The responder rows already carry a `direction`, so this filters
 * on it.
 *
 * Same query key as that component, so wherever both are on screen they share one fetch.
 */
export function ClaimSideResponders({
  entityId,
  spaceId,
  responseKind,
  direction,
  label,
  totalResponders,
}: {
  entityId: string;
  spaceId: string;
  responseKind: ResponseKind;
  direction: ActiveResponseDirection;
  /** Names the side in the claim's own vocabulary, for the panel's footer and the trigger's label. */
  label: string;
  /** The authoritative count for this side, which can exceed the faces the query returns. */
  totalResponders: number;
}) {
  const [open, setOpen] = React.useState(false);
  const closeTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancelClose = React.useCallback(() => {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  }, []);

  const scheduleClose = React.useCallback(() => {
    cancelClose();
    closeTimer.current = setTimeout(() => setOpen(false), CLOSE_GRACE_MS);
  }, [cancelClose]);

  React.useEffect(() => cancelClose, [cancelClose]);

  const { data: responders } = useQuery({
    queryKey: entityRespondersQueryKey(entityId, spaceId, CLAIM_RESPONSE_OBJECT_TYPE, responseKind),
    queryFn: () => Effect.runPromise(getEntityResponders(entityId, spaceId, responseKind, CLAIM_RESPONSE_OBJECT_TYPE)),
    staleTime: 30_000,
  });

  const sideSpaceIds = React.useMemo(
    () => (responders ?? []).filter(responder => responder.direction === direction).map(responder => responder.userId),
    [direction, responders]
  );

  if (sideSpaceIds.length === 0) return null;

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      {/* Hover opens it, and so do click and keyboard focus. Hover alone would put the list out of
          reach of anyone on a touchscreen or a keyboard, and Radix has no hover-card primitive
          installed to hand that to. */}
      <Popover.Trigger
        aria-label={`${totalResponders} ${pluralize('person', totalResponders)} ${label.toLowerCase()}`}
        onMouseEnter={() => {
          cancelClose();
          setOpen(true);
        }}
        onMouseLeave={scheduleClose}
        onFocus={() => setOpen(true)}
        className="inline-flex cursor-pointer items-center rounded"
      >
        <RankingAggregatedSubmitterAvatars
          submitterSpaceIds={sideSpaceIds}
          // The aggregate count can be ahead of the responder rows; taking the larger keeps the
          // "+N" honest rather than letting it go negative.
          totalCount={Math.max(totalResponders, sideSpaceIds.length)}
          size={12}
        />
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          side="bottom"
          align="start"
          sideOffset={8}
          avoidCollisions
          // Hovering must not steal focus, or the page scrolls to the panel under the pointer.
          onOpenAutoFocus={event => event.preventDefault()}
          onMouseEnter={cancelClose}
          onMouseLeave={scheduleClose}
          className="z-100 origin-top-left"
        >
          {open ? <ResponderList spaceIds={sideSpaceIds} label={label} totalCount={totalResponders} /> : null}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

/**
 * The list itself, built to match the space editors and members popovers — same width, same
 * scroll cap, same divided rows and counted footer — so a reader meets one list pattern in the
 * app rather than two that do the same job differently.
 */
function ResponderList({ spaceIds, label, totalCount }: { spaceIds: string[]; label: string; totalCount: number }) {
  const { data: profiles, isLoading } = useQuery({
    queryKey: ['claim-side-responder-profiles', spaceIds],
    queryFn: () => Effect.runPromise(fetchProfilesBySpaceIds(spaceIds)),
    staleTime: 30_000,
  });

  return (
    <div className="z-10 w-[356px] divide-y divide-grey-02 rounded-lg border border-grey-02 bg-white shadow-lg">
      <div className="max-h-[265px] overflow-hidden overflow-y-auto">
        {isLoading || !profiles ? (
          <ResponderRowSkeletons count={Math.min(spaceIds.length, 5)} />
        ) : (
          profiles.map(profile => <MemberRow key={profile.id} user={profile} />)
        )}
      </div>
      <div className="flex items-center justify-between p-2">
        <p className="text-smallButton text-text">
          {totalCount} {pluralize('person', totalCount)}
        </p>
        <p className="text-smallButton text-grey-04">{label}</p>
      </div>
    </div>
  );
}

function ResponderRowSkeletons({ count = 5 }: { count?: number }) {
  return (
    <>
      {Array.from({ length: count }).map((_, index) => (
        <div key={index} className="flex items-center gap-2 p-2">
          <Skeleton className="h-8 w-8 rounded-full" />
          <Skeleton className="h-4 w-32" />
        </div>
      ))}
    </>
  );
}
