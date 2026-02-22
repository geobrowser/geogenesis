'use client';

import cx from 'classnames';

import { useEffect, useState } from 'react';

import { useVote } from '~/core/hooks/use-vote';
import { NavUtils } from '~/core/utils/utils';

import { Avatar } from '~/design-system/avatar';
import { SmallButton } from '~/design-system/button';
import { GeoImage } from '~/design-system/geo-image';
import { Pending } from '~/design-system/pending';
import { PrefetchLink as Link } from '~/design-system/prefetch-link';

interface Props {
  spaceId: string;
  proposalId: string;
  proposalName: string;
  proposedMember: {
    id: string;
    avatarUrl: string | null;
    profileLink: string | null;
  };
  space: {
    id: string;
    name: string | null;
    image: string;
  };
}

export function AcceptOrRejectMember({ spaceId, proposalId, proposalName, proposedMember, space }: Props) {
  const [dismissed, setDismissed] = useState<boolean>(false);

  const [selectedVote, setSelectedVote] = useState<'ACCEPT' | 'REJECT' | null>(null);

  const { vote, status: voteStatus } = useVote({
    spaceId,
    proposalId,
  });

  const hasVoted = voteStatus === 'success';
  const hasError = voteStatus === 'error';
  const isPendingApproval = selectedVote === 'ACCEPT' && voteStatus === 'pending';
  const isPendingRejection = selectedVote === 'REJECT' && voteStatus === 'pending';

  const onApprove = () => {
    setSelectedVote('ACCEPT');
    vote('ACCEPT');
  };

  const onReject = () => {
    setSelectedVote('REJECT');
    vote('REJECT');
  };

  useEffect(() => {
    if (hasVoted) {
      const timer = setTimeout(() => setDismissed(true), 1_500);
      return () => clearTimeout(timer);
    }
  }, [hasVoted]);

  if (dismissed) return null;

  const header = (
    <div className="flex items-center justify-between">
      <div className="text-smallTitle">{proposalName}</div>
      <div className="relative h-5 w-5 overflow-hidden rounded-full">
        <Avatar avatarUrl={proposedMember.avatarUrl} value={proposedMember.id} size={20} />
      </div>
    </div>
  );

  return (
    <div className="space-y-4 rounded-lg border border-grey-02 p-4">
      <div className="space-y-2">
        {proposedMember.profileLink ? (
          <Link href={proposedMember.profileLink} className="w-full">
            {header}
          </Link>
        ) : (
          <div className="w-full">{header}</div>
        )}

        <Link href={NavUtils.toSpace(space.id)} className="flex items-center gap-1.5 text-breadcrumb text-grey-04">
          <div className="inline-flex items-center gap-1.5 transition-colors duration-75 hover:text-text">
            <div className="relative h-3 w-3 overflow-hidden rounded-full">
              <GeoImage
                value={space.image}
                alt={`Cover image for space ${space.name ?? space.id}`}
                fill
                style={{ objectFit: 'cover' }}
              />
            </div>
            <p>{space.name}</p>
          </div>
        </Link>
      </div>

      <div className="flex items-center justify-between">
        <p className="text-metadataMedium">1 vote required</p>

        {hasError ? (
          <div className="flex items-center gap-2">
            <p className="text-smallButton text-red-01">Vote failed</p>
            <SmallButton
              variant="secondary"
              onClick={() => {
                if (selectedVote) vote(selectedVote);
              }}
            >
              Retry
            </SmallButton>
          </div>
        ) : (
          <div className="relative">
            <div className={cx('flex items-center gap-2', hasVoted && 'invisible')}>
              <SmallButton variant="secondary" onClick={onReject} disabled={voteStatus !== 'idle'}>
                <Pending isPending={isPendingRejection}>Reject</Pending>
              </SmallButton>
              <SmallButton variant="secondary" onClick={onApprove} disabled={voteStatus !== 'idle'}>
                <Pending isPending={isPendingApproval}>Approve</Pending>
              </SmallButton>
            </div>
            {hasVoted && (
              <div className="absolute inset-0 flex h-full w-full items-center justify-center">
                <div className="text-smallButton">{selectedVote === 'ACCEPT' ? 'Approved' : 'Rejected'}</div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
