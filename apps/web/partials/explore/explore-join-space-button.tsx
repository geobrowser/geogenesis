'use client';

import * as React from 'react';

import { useOnboardGuard } from '~/core/hooks/use-onboard-guard';
import { useRequestToBeMember } from '~/core/hooks/use-request-to-be-member';

import { Pending } from '~/design-system/pending';

type ExploreJoinSpaceButtonProps = {
  spaceId: string;
  hasRequestedSpaceMembership: boolean;
};

export function ExploreJoinSpaceButton({ spaceId, hasRequestedSpaceMembership }: ExploreJoinSpaceButtonProps) {
  const { requestToBeMember, status } = useRequestToBeMember({ spaceId });
  const { shouldShowElement } = useOnboardGuard();
  const [localSuccess, setLocalSuccess] = React.useState(false);

  React.useEffect(() => {
    if (status === 'success') setLocalSuccess(true);
  }, [status]);

  if (!shouldShowElement) {
    return null;
  }

  const showPendingLabel = hasRequestedSpaceMembership || localSuccess;

  return (
    <Pending isPending={status === 'pending'} position="end">
      {showPendingLabel ? (
        <span className="text-smallButton text-grey-04">Membership pending</span>
      ) : (
        <button
          type="button"
          className="text-smallButton text-grey-04 transition-colors duration-75 hover:text-text"
          disabled={status !== 'idle'}
          onClick={() => requestToBeMember()}
        >
          Join space
        </button>
      )}
    </Pending>
  );
}
