'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';

import { usePersonalSpaceId } from '~/core/hooks/use-personal-space-id';
import { useSubspace } from '~/core/hooks/use-subspace';
import { ID } from '~/core/id';
import { fetchSpaceVerification } from '~/core/io/subgraph/fetch-space-verification';

import { TickSmall } from '~/design-system/icons/tick-small';

const verificationQueryKey = (parentSpaceId: string, childSpaceId: string) => [
  'space-verification',
  parentSpaceId,
  childSpaceId,
];

/** Verifies the viewed space directly from the viewer's personal space. */
export function SpaceVerifyButton({ spaceId }: { spaceId: string }) {
  const queryClient = useQueryClient();
  const { personalSpaceId, isRegistered, isLoading: isPersonalSpaceLoading } = usePersonalSpaceId();
  const { setSubspace, setStatus, unsetSubspace, unsetStatus } = useSubspace({ spaceId: personalSpaceId });
  const canVerify = Boolean(personalSpaceId && isRegistered && !ID.equals(personalSpaceId, spaceId));
  const verificationQuery = useQuery({
    queryKey: verificationQueryKey(personalSpaceId ?? '', spaceId),
    queryFn: () => (personalSpaceId ? fetchSpaceVerification(personalSpaceId, spaceId) : false),
    enabled: canVerify,
  });

  if (isPersonalSpaceLoading || !canVerify || !personalSpaceId) return null;

  const isVerified = verificationQuery.data === true;
  const isVerifying = setStatus === 'pending';
  const isUnverifying = unsetStatus === 'pending';

  const updateVerification = (verified: boolean) => {
    queryClient.setQueryData(verificationQueryKey(personalSpaceId, spaceId), verified);
    void queryClient.invalidateQueries({ queryKey: ['active-subspaces', personalSpaceId] });
  };

  const verify = () => {
    setSubspace(
      { subspaceId: spaceId, relationType: 'verified' },
      {
        onSuccess: () => updateVerification(true),
      }
    );
  };

  const removeVerification = () => {
    unsetSubspace(
      { subspaceId: spaceId, relationType: 'verified' },
      {
        onSuccess: () => updateVerification(false),
      }
    );
  };

  if (isVerified) {
    return (
      <button
        type="button"
        onClick={removeVerification}
        disabled={isUnverifying}
        aria-label={isUnverifying ? 'Unverifying...' : 'Remove verification'}
        title={isUnverifying ? undefined : 'Remove verification'}
        className={`inline-flex h-5 shrink-0 items-center justify-center rounded-full bg-text text-white transition-opacity hover:opacity-80 disabled:cursor-wait disabled:opacity-50 ${isUnverifying ? 'gap-1 px-1.5 text-[12px] leading-[13px]' : 'w-5'}`}
      >
        <TickSmall />
        {isUnverifying ? 'Unverifying...' : null}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={verify}
      disabled={verificationQuery.isLoading || verificationQuery.isError || isVerifying}
      title={verificationQuery.isError ? 'Unable to check verification status' : undefined}
      className="inline-flex h-[18px] shrink-0 items-center gap-1 rounded-full border border-dashed border-grey-03 pr-1.5 pl-1 text-[12px] leading-[13px] tracking-[-0.35px] text-grey-04 transition-colors hover:border-grey-04 hover:text-text disabled:cursor-wait disabled:opacity-50"
    >
      <TickSmall />
      {isVerifying ? 'Verifying...' : 'Verify'}
    </button>
  );
}
