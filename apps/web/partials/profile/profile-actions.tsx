'use client';

import * as React from 'react';

import { ProfileDebateButton } from '~/core/debates/profile-debate-button';
import { usePersonalSpaceId } from '~/core/hooks/use-personal-space-id';
import { ID } from '~/core/id';

import { SmallButton } from '~/design-system/button';

import { EntityVoteButtons } from '~/partials/entity-page/entity-vote-buttons';
import { EditProfileDialog } from '~/partials/profile/edit-profile-dialog';

type Props = {
  /** The personal space being viewed. */
  spaceId: string;
  /** The person entity, which is what a vote is cast against. */
  personEntityId: string;
};

/**
 * The controls in a profile header (GEO-2859).
 *
 * Two views of one row, differing only in the middle. Everyone can weigh this
 * person — vote on them, and reach share or copy id through the overflow. The
 * owner does that too, plus the one thing nobody else can do.
 *
 * **Debate is absent for the owner rather than disabled**, because it means
 * nothing pointed at yourself.
 *
 * Verify is not here at all: it sits beside the name, where it reads as a
 * statement about who this is rather than as one more thing to do to them.
 *
 * Edit profile leads, and the vote pair closes the row. The owner's own action
 * on their own page is the primary one; judging yourself is not, and reading
 * left to right it should not be the first thing offered. A visitor keeps the
 * vote first and then escalates: reversible click, live commitment, staked
 * claim.
 */
export function ProfileActions({ spaceId, personEntityId }: Props) {
  const { personalSpaceId } = usePersonalSpaceId();
  const [isEditOpen, setIsEditOpen] = React.useState(false);

  const isOwner = Boolean(personalSpaceId && ID.equals(personalSpaceId, spaceId));

  return (
    <div className="flex items-center gap-2">
      {isOwner ? (
        <>
          <SmallButton onClick={() => setIsEditOpen(true)}>Edit profile</SmallButton>
          <EditProfileDialog open={isEditOpen} onOpenChange={setIsEditOpen} />
          <EntityVoteButtons entityId={personEntityId} spaceId={spaceId} />
        </>
      ) : (
        <>
          <EntityVoteButtons entityId={personEntityId} spaceId={spaceId} />
          {/* Only when they are actually available to debate — the button hides
              itself otherwise, and the row closes up. */}
          <ProfileDebateButton spaceId={spaceId} />
        </>
      )}
    </div>
  );
}
