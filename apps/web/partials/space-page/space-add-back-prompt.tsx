'use client';

import { useQuery } from '@tanstack/react-query';

import * as React from 'react';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';

import { useFastPathRestriction, useViewerVotingMode } from '~/core/hooks/use-fast-path-restricted';
import { useMemberFastPath } from '~/core/hooks/use-member-fast-path';
import { useProfilesBySpaceIds } from '~/core/hooks/use-profiles-by-space-ids';
import { useProposeAddMember } from '~/core/hooks/use-propose-add-member';
import { validateSpaceId } from '~/core/io/rest/validation';
import { ADD_BACK_PARAM } from '~/core/utils/add-back-link';
import { readSpaceMembership } from '~/core/utils/contracts/read-space-membership';
import { formatShortAddress } from '~/core/utils/utils';

import { SmallButton } from '~/design-system/button';

import { SpaceMembersManageDialog } from './space-members-manage-dialog';

interface Props {
  spaceId: string;
  spaceName?: string;
}

/**
 * Opens for an editor who follows an "Ask an editor" link from someone who can't request to join.
 *
 * A space on the review path only can't request membership, so the editor adds them with a
 * proposal. The editor chooses whether they get the fast path too: a restriction an editor set on
 * purpose shouldn't be lifted by default.
 */
export function SpaceAddBackPrompt({ spaceId, spaceName }: Props) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const memberSpaceId = validateSpaceId(searchParams?.get(ADD_BACK_PARAM)?.replace(/^0x/, '') ?? '');

  const close = React.useCallback(() => {
    const next = new URLSearchParams(searchParams?.toString());
    next.delete(ADD_BACK_PARAM);
    const query = next.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }, [pathname, router, searchParams]);

  if (!memberSpaceId) return null;

  return (
    <SpaceMembersManageDialog
      open
      onOpenChange={open => (open ? undefined : close())}
      header={<h1 className="text-smallTitle">Add someone back</h1>}
      content={<AddBackContent spaceId={spaceId} spaceName={spaceName} memberSpaceId={memberSpaceId} />}
    />
  );
}

function AddBackContent({ spaceId, spaceName, memberSpaceId }: Props & { memberSpaceId: string }) {
  const memberSpaceIds = React.useMemo(() => [memberSpaceId], [memberSpaceId]);
  const { profilesBySpaceId } = useProfilesBySpaceIds(memberSpaceIds);
  const membership = useQuery({
    queryKey: ['space-membership', spaceId, memberSpaceId],
    queryFn: () => readSpaceMembership(spaceId, memberSpaceId),
    staleTime: 0,
  });
  const restriction = useFastPathRestriction(spaceId, memberSpaceId);
  // The prompt only mounts for editors.
  const votingMode = useViewerVotingMode({ spaceId, isEditor: true });
  const withFastPath = useMemberFastPath({ spaceId, action: 'add_back_with_fast_path' });
  const reviewOnly = useProposeAddMember({ spaceId });

  const name = profilesBySpaceId.get(memberSpaceId)?.name ?? formatShortAddress(memberSpaceId);
  const where = spaceName ?? 'this space';
  const sent = withFastPath.status === 'success' || reviewOnly.status === 'success';
  const { refetch: refetchMembership } = membership;

  // A fast-path add executes as it's proposed, while a review-path one waits for its vote. Read
  // membership again rather than guessing which happened.
  React.useEffect(() => {
    if (sent) void refetchMembership();
  }, [sent, refetchMembership]);

  if (sent) {
    if (membership.isFetching) return <p className="text-body text-grey-04">Checking {name}&apos;s access…</p>;
    return (
      <p className="text-body">
        {membership.data
          ? `${name} is now a member of ${where}.`
          : `Proposal created. ${name} is added once it passes the vote.`}
      </p>
    );
  }

  if (membership.isError || restriction.isError) {
    return (
      <p className="text-body">
        Couldn&apos;t check {name}&apos;s access to {where}. Please try again.
      </p>
    );
  }

  if (membership.isLoading || restriction.isLoading) {
    return <p className="text-body text-grey-04">Checking {name}&apos;s access…</p>;
  }

  if (membership.data) {
    return (
      <p className="text-body">
        {name} is already a member of {where}.
      </p>
    );
  }

  // The fast-path proposal reverts for someone who isn't restricted, so it's never offered then.
  if (!restriction.isRestricted) {
    return (
      <p className="text-body">
        {name} isn&apos;t blocked from {where}. They can request to join from the space page.
      </p>
    );
  }

  const busy = withFastPath.status === 'pending' || reviewOnly.status === 'pending';

  return (
    <div className="flex flex-col gap-4">
      <p className="text-body">
        {name} is on review only in {where}, so they can&apos;t request to join. You can add them with a proposal.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <SmallButton disabled={busy} onClick={() => withFastPath.run(memberSpaceId)}>
          {withFastPath.status === 'pending' ? 'Proposing…' : 'Add back with fast path'}
        </SmallButton>
        <SmallButton
          disabled={busy}
          onClick={() => reviewOnly.proposeAddMember({ targetMemberSpaceId: memberSpaceId, votingMode })}
        >
          {reviewOnly.status === 'pending' ? 'Proposing…' : 'Add back on review only'}
        </SmallButton>
      </div>
    </div>
  );
}
