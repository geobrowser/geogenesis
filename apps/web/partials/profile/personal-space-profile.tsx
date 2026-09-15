'use client';

import * as React from 'react';

import { usePersonalSpaceId } from '~/core/hooks/use-personal-space-id';
import { useProfileHistory } from '~/core/hooks/use-profile-history';
import { ID } from '~/core/id';
import { type ProfileLink } from '~/core/profile/profile-links';
import { collectSkills, currentRoles } from '~/core/profile/profile-summary';

import { EditRecordDialog } from './edit-record-dialog';
import { ProfileHeadline } from './profile-headline';
import { ProfileRecordSection, ProfileSkillsSection } from './profile-record-sections';

type Props = {
  /** The personal space being viewed. Every count keys on this. */
  spaceId: string;
  /** The person entity. Presentation hangs off this. */
  personEntityId: string;
  links: ProfileLink[];
};

/**
 * The identity half of a personal space (GEO-2859).
 *
 * Experience, Education and Skills, read from the same three-level shape #2412
 * writes. The headline is rendered separately, into the header, because it sits
 * under the name rather than in the column.
 */
export function PersonalSpaceProfile({ spaceId, personEntityId }: Props) {
  const { personalSpaceId } = usePersonalSpaceId();
  const isOwner = Boolean(personalSpaceId && ID.equals(personalSpaceId, spaceId));

  const history = useProfileHistory({ entityId: personEntityId, spaceId });
  const [editing, setEditing] = React.useState<'employment' | 'education' | null>(null);

  const skills = React.useMemo(
    () => collectSkills(history.employment, history.education),
    [history.employment, history.education]
  );

  // A read that failed is not an account with nothing on it. Showing empty
  // sections on a failure would invite the owner to add a company that is
  // already there, which is how a second Employment edge gets written.
  if (history.isUnavailable) {
    return (
      <p className="rounded-lg border border-dashed border-grey-02 px-3 py-4 text-center text-metadata text-grey-04">
        We couldn’t load this profile. Try reloading the page.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <ProfileRecordSection
        kind="employment"
        cards={history.employment}
        isOwner={isOwner}
        onEdit={() => setEditing('employment')}
        spaceId={spaceId}
      />
      <ProfileRecordSection
        kind="education"
        cards={history.education}
        isOwner={isOwner}
        onEdit={() => setEditing('education')}
        spaceId={spaceId}
      />
      <ProfileSkillsSection skills={skills} isOwner={isOwner} spaceId={spaceId} />

      <EditRecordDialog
        kind={editing}
        onOpenChange={() => setEditing(null)}
        entityId={personEntityId}
        spaceId={spaceId}
      />
    </div>
  );
}

/**
 * The current roles and degrees that sit under the name.
 *
 * Its own component because it renders into the header, which is assembled in
 * the layout rather than the page — but it reads the same history as the
 * sections, so the query is shared by React Query's cache rather than run twice.
 */
export function PersonalSpaceHeadline({ spaceId, personEntityId }: { spaceId: string; personEntityId: string }) {
  const history = useProfileHistory({ entityId: personEntityId, spaceId });

  const roles = React.useMemo(
    () => currentRoles(history.employment, history.education),
    [history.employment, history.education]
  );

  return <ProfileHeadline roles={roles} spaceId={spaceId} />;
}
