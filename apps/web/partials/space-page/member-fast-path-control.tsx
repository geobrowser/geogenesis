'use client';

import { useIsFastPathRestricted } from '~/core/hooks/use-fast-path-restricted';
import { useMemberFastPath } from '~/core/hooks/use-member-fast-path';
import { useSpace } from '~/core/hooks/use-space';

import { SmallButton } from '~/design-system/button';
import { Tag } from '~/design-system/tag';

interface Props {
  spaceId: string;
  memberSpaceId: string;
}

/**
 * Shows an editor whether one person is on the review path only, and lets them change it.
 *
 * Making someone review-only is immediate. Giving fast path back is a governance action on the
 * DAO contract, so it creates a review-path proposal, and the button says so.
 */
export function MemberFastPathControl({ spaceId, memberSpaceId }: Props) {
  const { space } = useSpace(spaceId);
  const { isFastPathRestricted, isLoading } = useIsFastPathRestricted(space?.address, memberSpaceId);

  if (!space?.address || isLoading) return null;

  return isFastPathRestricted ? (
    <GiveFastPath spaceId={spaceId} memberSpaceId={memberSpaceId} />
  ) : (
    <MakeReviewOnly spaceId={spaceId} memberSpaceId={memberSpaceId} />
  );
}

function GiveFastPath({ spaceId, memberSpaceId }: Props) {
  const { run, status } = useMemberFastPath({ spaceId, action: 'give_fast_path' });

  const label = (() => {
    switch (status) {
      case 'pending':
        return 'Proposing…';
      case 'success':
        return 'Proposal created';
      case 'error':
        return 'Try again';
      default:
        return 'Propose fast path';
    }
  })();

  return (
    <div className="flex items-center gap-2">
      <Tag>Review only</Tag>
      <SmallButton
        disabled={status === 'pending' || status === 'success'}
        title="Creates a proposal. Once it passes, this person's proposals can use the fast path."
        onClick={event => {
          event.preventDefault();
          run(memberSpaceId);
        }}
      >
        {label}
      </SmallButton>
    </div>
  );
}

function MakeReviewOnly({ spaceId, memberSpaceId }: Props) {
  const { run, status } = useMemberFastPath({ spaceId, action: 'make_review_only' });

  const label = (() => {
    switch (status) {
      case 'pending':
        return 'Updating…';
      case 'success':
        return 'Review only';
      case 'error':
        return 'Try again';
      default:
        return 'Make review only';
    }
  })();

  return (
    <SmallButton
      disabled={status === 'pending' || status === 'success'}
      title="Takes effect now. This person's proposals will need a full vote."
      onClick={event => {
        event.preventDefault();
        run(memberSpaceId);
      }}
    >
      {label}
    </SmallButton>
  );
}
