'use client';

import * as React from 'react';

import { ProfileDebateButton } from '~/core/debates/profile-debate-button';
import { FollowButton } from '~/core/follows/follow-button';
import { usePersonalSpaceId } from '~/core/hooks/use-personal-space-id';
import { ID } from '~/core/id';

import { SmallButton } from '~/design-system/button';

import { EditProfileDialog } from '~/partials/profile/edit-profile-dialog';

type Props = {
  /** The personal space being viewed, which is what a follow is cast on (GEO-3236). */
  spaceId: string;
  /** The person's name, for the Follow button's label. */
  name?: string | null;
};

/**
 * The controls in a profile header (GEO-2859).
 *
 * Two views of one row. A visitor can follow this person and, when they're available, ask them to
 * debate. The owner gets the one thing nobody else can do: edit the profile.
 *
 * **Follow replaced the vote pair (GEO-3236).** Upvoting a person said nothing about wanting to see
 * more of them; following does. It is the white pill because Request debate, the live commitment,
 * keeps the black one.
 *
 * **Debate and Follow are absent for the owner rather than disabled**, because neither means
 * anything pointed at yourself.
 *
 * Verify is not here at all: it sits beside the name, where it reads as a statement about who this
 * is rather than as one more thing to do to them.
 */
export function ProfileActions({ spaceId, name }: Props) {
  const { personalSpaceId, isLoading: isLoadingOwnership } = usePersonalSpaceId();
  const [isEditOpen, setIsEditOpen] = React.useState(false);

  const isOwner = Boolean(personalSpaceId && ID.equals(personalSpaceId, spaceId));

  /**
   * Nothing branch-dependent until we know whose profile this is.
   *
   * `personalSpaceId` is null while it loads, which reads as "not the owner" — so an owner's own
   * profile briefly offered **Debate**, a request to argue with themselves, and hid Edit profile.
   * Follow would do the same. Withholding an affordance for a moment is cheap; offering the wrong
   * one is not.
   */
  if (isLoadingOwnership) return null;

  return (
    <div className="flex items-center gap-2">
      {isOwner ? (
        <>
          <SmallButton onClick={() => setIsEditOpen(true)}>Edit profile</SmallButton>
          <EditProfileDialog open={isEditOpen} onOpenChange={setIsEditOpen} />
        </>
      ) : (
        <>
          <FollowButton target={{ kind: 'person', id: spaceId, name }} variant="secondary" />
          {/* Only when they are actually available to debate — the button hides
              itself otherwise, and the row closes up. */}
          <ProfileDebateButton spaceId={spaceId} />
        </>
      )}
    </div>
  );
}
