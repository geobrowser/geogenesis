'use client';

import { useJoinSpace } from '~/core/hooks/use-join-space';
import type { FeaturedSpace } from '~/core/io/subgraph/fetch-featured-spaces';

import { Dots } from '~/design-system/dots';
import {
  SPACE_PILL_CLASS,
  SpacePillAvatar,
  SpacePillLabel,
  SpacePillList,
  SpacePillSectionHeading,
} from '~/design-system/space-pill';

type Props = {
  // Already filtered by the side panel to spaces the user can still join.
  spaces: FeaturedSpace[];
};

export function JoinSpacesSection({ spaces }: Props) {
  if (spaces.length === 0) return null;

  return (
    <section className="flex flex-col">
      <SpacePillSectionHeading>Join spaces</SpacePillSectionHeading>

      <SpacePillList
        items={spaces}
        keyFor={space => space.spaceId}
        renderPill={space => <JoinSpacePill space={space} />}
      />
    </section>
  );
}

function JoinSpacePill({ space }: { space: FeaturedSpace }) {
  // On success useRequestToBeMember records the request (persisted) and
  // invalidates the durable pending sources, so the pill drops out of this list
  // — the side panel re-filters off the same state — and the space surfaces as
  // "Membership pending" in the browse sidebar.
  const { join, status, optimisticRequested } = useJoinSpace({
    spaceId: space.spaceId,
    space: { name: space.name, image: space.image },
  });

  const isPending = status === 'pending' || optimisticRequested;

  return (
    // While the request is in flight keep the icon and outline in place and swap
    // just the name for the oscillating dots, so the pill doesn't blink out.
    <button
      type="button"
      aria-label={`Join ${space.name}`}
      disabled={status !== 'idle' || optimisticRequested}
      onClick={join}
      className={SPACE_PILL_CLASS}
    >
      <SpacePillAvatar value={space.image} />
      {isPending ? (
        <span className="flex h-[18px] items-center px-1">
          <Dots />
        </span>
      ) : (
        <SpacePillLabel>{space.name}</SpacePillLabel>
      )}
    </button>
  );
}
