'use client';

import { DaoSpaceAbi } from '@geoprotocol/geo-sdk/abis';
import { useQuery } from '@tanstack/react-query';

import * as React from 'react';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { createPublicClient, http } from 'viem';

import { useIsFastPathRestricted } from '~/core/hooks/use-fast-path-restricted';
import { ADD_BACK_PARAM } from '~/core/hooks/use-locked-out-of-space';
import { useMemberFastPath } from '~/core/hooks/use-member-fast-path';
import { useProfilesBySpaceIds } from '~/core/hooks/use-profiles-by-space-ids';
import { useSpace } from '~/core/hooks/use-space';
import { formatShortAddress, validateSpaceId } from '~/core/utils/utils';
import { GEOGENESIS } from '~/core/wallet/geo-chain';

import { SmallButton } from '~/design-system/button';

import { SpaceMembersManageDialog } from './space-members-manage-dialog';

interface Props {
  spaceId: string;
  spaceName?: string;
}

/**
 * Opens for an editor who follows an "Ask an editor" link from someone locked out of the space.
 *
 * Someone on review only who left keeps the restriction and can't request to join, so the
 * editor adds them back with a review-path proposal. The editor chooses whether they come back
 * with the fast path: a restriction an editor set on purpose shouldn't be lifted by default.
 */
export function SpaceAddBackPrompt({ spaceId, spaceName }: Props) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const memberSpaceId = searchParams?.get(ADD_BACK_PARAM)?.replace(/^0x/, '') ?? null;
  const openerRef = React.useRef<HTMLButtonElement>(null);

  const close = React.useCallback(() => {
    const next = new URLSearchParams(searchParams?.toString());
    next.delete(ADD_BACK_PARAM);
    const query = next.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }, [pathname, router, searchParams]);

  if (!memberSpaceId || !validateSpaceId(memberSpaceId)) return null;

  return (
    <SpaceMembersManageDialog
      open
      onOpenChange={open => (open ? undefined : close())}
      openerRef={openerRef}
      header={<h1 className="text-smallTitle">Add someone back</h1>}
      content={<AddBackContent spaceId={spaceId} spaceName={spaceName} memberSpaceId={memberSpaceId} />}
    />
  );
}

function useIsMember(spaceAddress: string | undefined, memberSpaceId: string) {
  return useQuery({
    queryKey: ['dao-member-role', spaceAddress?.toLowerCase(), memberSpaceId],
    enabled: Boolean(spaceAddress),
    queryFn: async () => {
      const client = createPublicClient({ chain: GEOGENESIS, transport: http() });
      const address = spaceAddress as `0x${string}`;
      const role = await client.readContract({ address, abi: DaoSpaceAbi, functionName: 'MEMBER' });
      return client.readContract({
        address,
        abi: DaoSpaceAbi,
        functionName: 'hasRole',
        args: [role, `0x${memberSpaceId}`],
      });
    },
  });
}

function AddBackContent({ spaceId, spaceName, memberSpaceId }: Props & { memberSpaceId: string }) {
  const { space } = useSpace(spaceId);
  const { profilesBySpaceId } = useProfilesBySpaceIds([memberSpaceId]);
  const { data: isMember, isLoading: isMemberLoading } = useIsMember(space?.address, memberSpaceId);
  const { isFastPathRestricted, isLoading: isRestrictionLoading } = useIsFastPathRestricted(
    space?.address,
    memberSpaceId
  );
  const withFastPath = useMemberFastPath({ spaceId, action: 'add_back_with_fast_path' });
  const reviewOnly = useMemberFastPath({ spaceId, action: 'add_back_review_only' });

  const name = profilesBySpaceId.get(memberSpaceId)?.name ?? formatShortAddress(memberSpaceId);
  const where = spaceName ?? 'this space';

  if (!space?.address || isMemberLoading || isRestrictionLoading) {
    return <p className="text-body text-grey-04">Checking {name}'s access…</p>;
  }

  if (isMember) {
    return (
      <p className="text-body">
        {name} is already a member of {where}.
      </p>
    );
  }

  if (!isFastPathRestricted) {
    return (
      <p className="text-body">
        {name} isn&apos;t blocked from {where}. They can request to join from the space page.
      </p>
    );
  }

  const busy = withFastPath.status === 'pending' || reviewOnly.status === 'pending';
  const done = withFastPath.status === 'success' || reviewOnly.status === 'success';

  if (done) {
    return <p className="text-body">Proposal created. {name} is added back once it passes the vote.</p>;
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-body">
        {name} left {where} while on review only, so they can&apos;t request to join again. You can add them back with a
        proposal.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <SmallButton variant="primary" disabled={busy} onClick={() => withFastPath.run(memberSpaceId)}>
          {withFastPath.status === 'pending' ? 'Proposing…' : 'Add back with fast path'}
        </SmallButton>
        <SmallButton disabled={busy} onClick={() => reviewOnly.run(memberSpaceId)}>
          {reviewOnly.status === 'pending' ? 'Proposing…' : 'Add back on review only'}
        </SmallButton>
      </div>
    </div>
  );
}
