'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';

import { usePersonalSpaceId } from '~/core/hooks/use-personal-space-id';
import { useSubspace } from '~/core/hooks/use-subspace';
import { ID } from '~/core/id';
import { fetchSpaceVerification } from '~/core/io/subgraph/fetch-space-verification';

const verificationQueryKey = (parentSpaceId: string, childSpaceId: string) => [
  'space-verification',
  parentSpaceId,
  childSpaceId,
];

/** Verifies the viewed space directly from the viewer's personal space. */
export function SpaceVerifyButton({ spaceId }: { spaceId: string }) {
  const queryClient = useQueryClient();
  const { personalSpaceId, isRegistered, isLoading: isPersonalSpaceLoading } = usePersonalSpaceId();
  const { setSubspace, setStatus } = useSubspace({ spaceId: personalSpaceId });
  const canVerify = Boolean(personalSpaceId && isRegistered && !ID.equals(personalSpaceId, spaceId));
  const verificationQuery = useQuery({
    queryKey: verificationQueryKey(personalSpaceId ?? '', spaceId),
    queryFn: () => (personalSpaceId ? fetchSpaceVerification(personalSpaceId, spaceId) : false),
    enabled: canVerify,
  });

  if (isPersonalSpaceLoading || !canVerify || !personalSpaceId) return null;

  const isVerified = verificationQuery.data === true;
  const isPending = setStatus === 'pending';

  const verify = () => {
    setSubspace(
      { subspaceId: spaceId, relationType: 'verified' },
      {
        onSuccess: () => {
          queryClient.setQueryData(verificationQueryKey(personalSpaceId, spaceId), true);
          void queryClient.invalidateQueries({ queryKey: ['active-subspaces', personalSpaceId] });
        },
      }
    );
  };

  return (
    <button
      type="button"
      onClick={verify}
      disabled={verificationQuery.isLoading || isPending || isVerified}
      className="inline-flex h-7 shrink-0 items-center rounded-full bg-text px-2.5 text-metadata text-white transition-colors hover:bg-text/90 disabled:opacity-50"
    >
      {isPending ? 'Verifying...' : isVerified ? 'Verified' : 'Verify'}
    </button>
  );
}
