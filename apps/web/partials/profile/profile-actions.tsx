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
 * Left to right, cheapest to most committing: a vote is one click and
 * reversible, Debate is a live commitment, Verify is a claim you are staking.
 */
export function ProfileActions({ spaceId, personEntityId }: Props) {
  const { personalSpaceId } = usePersonalSpaceId();
  const [isEditOpen, setIsEditOpen] = React.useState(false);

  const isOwner = Boolean(personalSpaceId && ID.equals(personalSpaceId, spaceId));

  return (
    <div className="flex items-center gap-2">
      <EntityVoteButtons entityId={personEntityId} spaceId={spaceId} />

      {isOwner ? (
        <>
          <SmallButton onClick={() => setIsEditOpen(true)}>Edit profile</SmallButton>
          <EditProfileDialog open={isEditOpen} onOpenChange={setIsEditOpen} />
        </>
      ) : (
        <>
          {/* Only when they are actually available to debate — the button hides
              itself otherwise, and the row closes up. */}
          <ProfileDebateButton spaceId={spaceId} />
          <SpaceVerifyButton spaceId={spaceId} />
        </>
      )}
    </div>
  );
}
