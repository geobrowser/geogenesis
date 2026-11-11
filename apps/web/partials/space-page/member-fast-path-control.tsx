'use client';

import * as React from 'react';

import { useFastPathRestriction } from '~/core/hooks/use-fast-path-restricted';
import { useMemberFastPath } from '~/core/hooks/use-member-fast-path';
import { usePersonalSpaceId } from '~/core/hooks/use-personal-space-id';
import { useSpace } from '~/core/hooks/use-space';
import { type MutationStatusLabels, mutationStatusLabel } from '~/core/utils/mutation-status-label';

import { SmallButton } from '~/design-system/button';
import { Tag } from '~/design-system/tag';

interface Props {
  spaceId: string;
  memberSpaceId: string;
}

const GIVE_FAST_PATH: MutationStatusLabels & { title: string } = {
  idle: 'Propose fast path',
  pending: 'Proposing…',
  success: 'Proposal created',
  title: "Creates a proposal. Once it passes, this person's proposals can use the fast path.",
};

const MAKE_REVIEW_ONLY: MutationStatusLabels & { title: string; confirm: string } = {
  idle: 'Make review only',
  confirm: 'Confirm review only',
  pending: 'Updating…',
  success: 'Review only',
  title: "Takes effect now. Undoing it takes a proposal. This person's proposals will need a full vote.",
};

/**
 * Shows an editor whether one person is on the review path only, and lets them change it.
 *
 * Making someone review-only is immediate and only a vote can undo it, so it asks for a second
 * press. Giving fast path back is a governance action on the DAO contract, so it creates a
 * review-path proposal, and the button says so. Hidden on the viewer's own row.
 */
export function MemberFastPathControl({ spaceId, memberSpaceId }: Props) {
  const { space } = useSpace(spaceId);
  const { personalSpaceId } = usePersonalSpaceId();
  const isSelf = personalSpaceId === memberSpaceId;
  const { isRestricted, isLoading, isError } = useFastPathRestriction(
    isSelf ? undefined : space?.address,
    memberSpaceId
  );

  if (isSelf || !space?.address || isLoading) return null;
  if (isError) return <span className="text-smallButton text-grey-04">Couldn&apos;t check access</span>;

  return isRestricted ? (
    <div className="flex items-center gap-2">
      <Tag>Review only</Tag>
      <FastPathActionButton spaceId={spaceId} memberSpaceId={memberSpaceId} action="give_fast_path" />
    </div>
  ) : (
    <FastPathActionButton spaceId={spaceId} memberSpaceId={memberSpaceId} action="make_review_only" />
  );
}

function FastPathActionButton({
  spaceId,
  memberSpaceId,
  action,
}: Props & { action: 'give_fast_path' | 'make_review_only' }) {
  const { run, status } = useMemberFastPath({ spaceId, action });
  const [confirming, setConfirming] = React.useState(false);
  const labels = action === 'give_fast_path' ? GIVE_FAST_PATH : MAKE_REVIEW_ONLY;
  const needsConfirm = action === 'make_review_only' && status === 'idle';

  return (
    <SmallButton
      disabled={status === 'pending' || status === 'success'}
      title={labels.title}
      onClick={event => {
        event.preventDefault();
        if (needsConfirm && !confirming) return setConfirming(true);
        run(memberSpaceId);
      }}
      onBlur={() => setConfirming(false)}
    >
      {needsConfirm && confirming ? MAKE_REVIEW_ONLY.confirm : mutationStatusLabel(status, labels)}
    </SmallButton>
  );
}
