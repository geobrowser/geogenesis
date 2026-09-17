'use client';

import * as React from 'react';

import { usePersonalSpaceId } from '~/core/hooks/use-personal-space-id';
import { useRequestToBeMember } from '~/core/hooks/use-request-to-be-member';
import { useSmartAccount } from '~/core/hooks/use-smart-account';
import type { FeaturedSpace } from '~/core/io/subgraph/fetch-featured-spaces';
import { useEnqueuePendingAction } from '~/core/state/pending-actions';
import { useDeferredJoin } from '~/core/state/pending-join-intents';
import { useSignInPrompt } from '~/core/state/sign-in-prompt-store';

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
  const { requestToBeMember, requestToBeMemberAsync, status } = useRequestToBeMember({
    spaceId: space.spaceId,
    space: { name: space.name, image: space.image },
  });
  const { smartAccount } = useSmartAccount();
  const { personalSpaceId, isRegistered } = usePersonalSpaceId();
  const { open: openSignInPrompt } = useSignInPrompt();
  const enqueuePendingAction = useEnqueuePendingAction();
  const [optimisticRequested, setOptimisticRequested] = React.useState(false);

  const queueJoinRequest = React.useCallback(() => {
    setOptimisticRequested(true);
    enqueuePendingAction({
      id: `join:${space.spaceId}`,
      label: 'your membership request',
      requires: 'personalSpace',
      run: () => requestToBeMemberAsync(),
    });
  }, [enqueuePendingAction, space.spaceId, requestToBeMemberAsync]);

  const deferJoin = useDeferredJoin(space.spaceId, Boolean(smartAccount), queueJoinRequest);

  const canRequestLive = Boolean(smartAccount && isRegistered && personalSpaceId);

  const handleClick = () => {
    if (canRequestLive) {
      requestToBeMember();
      return;
    }
    if (!smartAccount) {
      deferJoin();
      openSignInPrompt('join');
      return;
    }
    queueJoinRequest();
  };

  const isPending = status === 'pending' || optimisticRequested;

  return (
    // While the request is in flight keep the icon and outline in place and swap
    // just the name for the oscillating dots, so the pill doesn't blink out.
    <button
      type="button"
      aria-label={`Join ${space.name}`}
      disabled={status !== 'idle' || optimisticRequested}
      onClick={handleClick}
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
