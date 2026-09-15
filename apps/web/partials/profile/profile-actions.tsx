'use client';

import * as React from 'react';

import { ProfileDebateButton } from '~/core/debates/profile-debate-button';
import { usePersonalSpaceId } from '~/core/hooks/use-personal-space-id';
import { ID } from '~/core/id';
import { SpaceVerifyButton } from '~/core/space/space-verify-button';

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
 * **Verify and Debate are absent for the owner rather than disabled**, because
 * neither means anything pointed at yourself: `SpaceVerifyButton` already
 * refuses to render when the viewer's own space is the one being viewed, and
 * the debate button is withheld here for the same reason.
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
          <SpaceVerifyButton spaceId={spaceId} />
        </>
      )}
    </div>
  );
}
