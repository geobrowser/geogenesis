'use client';

import * as React from 'react';

import { useRequestToBeMember } from '~/core/hooks/use-request-to-be-member';
import { useSmartAccount } from '~/core/hooks/use-smart-account';
import type { FeaturedSpace } from '~/core/io/subgraph/fetch-featured-spaces';
import { useSignInPrompt } from '~/core/state/sign-in-prompt-store';

import { Dots } from '~/design-system/dots';
import { FallbackImage } from '~/design-system/fallback-image';

import { OverviewSideRailSection } from '~/partials/side-panel/overview-side-rail';

type Props = {
  // Already filtered by the side panel to spaces the user can still join.
  spaces: FeaturedSpace[];
};

// Match the design: nine space pills, with a tenth "Show more" pill that
// reveals the rest.
const INITIAL_VISIBLE_COUNT = 9;

export function JoinSpacesSection({ spaces }: Props) {
  const [showAll, setShowAll] = React.useState(false);

  if (spaces.length === 0) return null;

  const visible = showAll ? spaces : spaces.slice(0, INITIAL_VISIBLE_COUNT);
  const hasMore = spaces.length > INITIAL_VISIBLE_COUNT;

  return (
    <OverviewSideRailSection title="Join spaces">
      <div className="flex flex-wrap gap-2">
        {visible.map(space => (
          <JoinSpacePill key={space.spaceId} space={space} />
        ))}

        {hasMore ? (
          <button
            type="button"
            onClick={() => setShowAll(prev => !prev)}
            className="inline-flex items-center rounded-full border border-grey-02 py-1.5 pr-2.5 pl-2 text-[16px] leading-[18px] text-grey-04 transition-colors hover:border-text hover:text-text"
          >
            {showAll ? 'Show less' : 'Show more'}
          </button>
        ) : null}
      </div>
    </OverviewSideRailSection>
  );
}

function JoinSpacePill({ space }: { space: FeaturedSpace }) {
  // On success useRequestToBeMember records the request (persisted) and
  // invalidates the durable pending sources, so the pill drops out of this list
  // — the side panel re-filters off the same state — and the space surfaces as
  // "Membership pending" in the browse sidebar.
  const { requestToBeMember, status } = useRequestToBeMember({
    spaceId: space.spaceId,
    space: { name: space.name, image: space.image },
  });
  const { smartAccount } = useSmartAccount();
  const { open: openSignInPrompt } = useSignInPrompt();

  const handleClick = () => {
    if (!smartAccount) {
      openSignInPrompt('join');
      return;
    }
    requestToBeMember();
  };

  const isPending = status === 'pending';

  return (
    // While the request is in flight keep the icon and outline in place and swap
    // just the name for the oscillating dots, so the pill doesn't blink out.
    <button
      type="button"
      aria-label={`Join ${space.name}`}
      disabled={status !== 'idle'}
      onClick={handleClick}
      className="inline-flex items-center gap-1.5 rounded-full border border-grey-02 py-1.5 pr-2.5 pl-2 text-[16px] leading-[18px] text-text transition-colors hover:border-text disabled:cursor-default"
    >
      <span className="relative h-4 w-4 shrink-0 overflow-hidden rounded-full bg-grey-01">
        <FallbackImage value={space.image} sizes="16px" className="object-cover" />
      </span>
      {isPending ? (
        <span className="flex h-[18px] items-center px-1">
          <Dots />
        </span>
      ) : (
        <span className="truncate">{space.name}</span>
      )}
    </button>
  );
}
