'use client';

import type { JoinSpaceTarget } from '~/core/chat/join-space-dispatcher';

import { Button } from '~/design-system/button';

export type JoinConfirmationRequest = {
  target: JoinSpaceTarget;
  onConfirm: () => void;
  onDecline: () => void;
};

type Props = {
  request: JoinConfirmationRequest;
};

export function ChatJoinConfirmation({ request }: Props) {
  const { target, onConfirm, onDecline } = request;
  const name = target.spaceName ?? `the space ${target.spaceId}`;

  return (
    <div role="group" aria-label="Confirm membership request" className="mx-3 mt-3 rounded-lg bg-grey-01 px-3 py-2">
      <p className="text-metadata font-medium text-text">Request to join {name}?</p>
      <p className="mt-0.5 text-metadata text-grey-04">
        This sends a membership proposal for the space&apos;s editors to vote on. Nothing is sent until you confirm.
      </p>
      <div className="mt-2 flex gap-2">
        <Button small onClick={onConfirm}>
          Request membership
        </Button>
        <Button small variant="secondary" onClick={onDecline}>
          Not now
        </Button>
      </div>
    </div>
  );
}
