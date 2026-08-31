'use client';

import * as Popover from '@radix-ui/react-popover';
import { useQuery } from '@tanstack/react-query';

import * as React from 'react';

import { Effect } from 'effect';
import pluralize from 'pluralize';

import { ID } from '~/core/id';
import { getEntityResponders } from '~/core/io/queries';
import { fetchProfilesBySpaceIds } from '~/core/io/subgraph/fetch-profile';
import {
  type ActiveResponseDirection,
  type ResponseKind,
  entityRespondersQueryKey,
} from '~/core/responses/entity-response';
import { useClaimResponseBatchState } from '~/core/responses/use-claim-response-summaries';

import { Skeleton } from '~/design-system/skeleton';
import { useElevatedPopoverPortal } from '~/design-system/use-elevated-popover-portal';

import { RankingAggregatedSubmitterAvatars } from '~/partials/blocks/table/ranking-period-metadata';
import { MemberRow } from '~/partials/space-page/space-member-row';

import { CLAIM_RESPONSE_OBJECT_TYPE } from './claim-response-summary';

/**
 * The people on one side of a claim: a stack of faces that opens the full list when pressed.
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
  viewerDirection,
  viewerSpaceId,
}: {
  entityId: string;
  spaceId: string;
  responseKind: ResponseKind;
  direction: ActiveResponseDirection;
  /** Names the side in the claim's own vocabulary, for the panel's footer and the trigger's label. */
  label: string;
  /** The authoritative count for this side, which can exceed the faces the query returns. */
  totalResponders: number;
  /** The side the viewer holds right now, optimistic included, and the space identifying them. */
  viewerDirection: ActiveResponseDirection | null;
  viewerSpaceId: string | null;
}) {
  // Held rather than left to Radix so the profile lookup below is deferred until the list is
  // actually opened — a page of claim cards would otherwise fetch every side's profiles up front.
  const [open, setOpen] = React.useState(false);

  // Above whatever the sides are drawn inside, not merely above the page. Radix's default portal
  // leaves this at the content's own `z-100` on `document.body`, which loses to the entity side
  // panel and to the debates hub — see the same note on `ClaimResponders`, where the faces stopped
  // opening anything at all.
  const elevatedPopoverPortal = useElevatedPopoverPortal();

  // Stands down under a batch, the same as the other two callers of this key.
  //
  // `ClaimResponseBatchBoundary` primes exactly this key for every claim on the page, so asking
  // here would be a per-row request for something already in the cache — and before the batch lands
  // there is nothing to answer from anyway. Unreachable under a batch as things stand, since
  // `ClaimSides` is only mounted by the claim page and the explore card; it was the odd one out of
  // three otherwise-identical call sites, which is how the deferral got lost the last time.
  const responseBatch = useClaimResponseBatchState();
  const { data: responders } = useQuery({
    queryKey: entityRespondersQueryKey(entityId, spaceId, CLAIM_RESPONSE_OBJECT_TYPE, responseKind),
    queryFn: () => Effect.runPromise(getEntityResponders(entityId, spaceId, responseKind, CLAIM_RESPONSE_OBJECT_TYPE)),
    enabled: !responseBatch.managed,
    staleTime: 30_000,
  });

  // The viewer is placed from their own response rather than from the indexed rows, which trail it
  // by a publish and an index. The counts above are adjusted the same way, so without this the
  // number on a side moves while the face stays on the old one — or disappears from both.
  //
  // Removed from wherever the index still has them and added to the side they now hold, so
  // switching sides and clearing both land correctly. Same overlay `ClaimResponderAvatars` does.
  const sideSpaceIds = React.useMemo(() => {
    const indexed = (responders ?? [])
      .filter(responder => responder.direction === direction)
      .map(responder => responder.userId);

    if (!viewerSpaceId) return indexed;

    const withoutViewer = indexed.filter(id => !ID.equals(id, viewerSpaceId));
    return viewerDirection === direction ? [viewerSpaceId, ...withoutViewer] : withoutViewer;
  }, [direction, responders, viewerDirection, viewerSpaceId]);

  if (sideSpaceIds.length === 0) return null;

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger
        aria-label={`${totalResponders} ${pluralize('person', totalResponders)} ${label.toLowerCase()}`}
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
      {elevatedPopoverPortal && (
        <Popover.Portal container={elevatedPopoverPortal}>
          <Popover.Content side="bottom" align="start" sideOffset={8} avoidCollisions className="z-100 origin-top-left">
            {open ? <ResponderList spaceIds={sideSpaceIds} label={label} totalCount={totalResponders} /> : null}
          </Popover.Content>
        </Popover.Portal>
      )}
    </Popover.Root>
  );
}

/**
 * The list itself: the space editors and members popover pattern — same scroll cap, same divided
 * rows, same counted footer — so a reader meets one list shape in the app rather than two that do
 * the same job differently.
 *
 * Narrower than those, though. They hang off a page header with the width to spare; this hangs off a
 * count inside a card, and at 356px it arrived as a slab wider than the column that opened it. A row
 * is a 32px avatar and a display name, so the box only ever needed to be about that wide.
 */
function ResponderList({ spaceIds, label, totalCount }: { spaceIds: string[]; label: string; totalCount: number }) {
  const { data: profiles, isLoading } = useQuery({
    queryKey: ['claim-side-responder-profiles', spaceIds],
    queryFn: () => Effect.runPromise(fetchProfilesBySpaceIds(spaceIds)),
    staleTime: 30_000,
  });

  return (
    <div className="z-10 w-[248px] divide-y divide-grey-02 rounded-lg border border-grey-02 bg-white shadow-lg">
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
