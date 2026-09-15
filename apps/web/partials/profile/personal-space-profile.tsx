'use client';

import * as React from 'react';

import { usePersonDebates } from '~/core/debates/use-person-debates';
import { usePersonalSpaceId } from '~/core/hooks/use-personal-space-id';
import { useProfileHistory } from '~/core/hooks/use-profile-history';
import { ID } from '~/core/id';
import { collectSkills, currentRoles } from '~/core/profile/profile-summary';
import { usePersonPositions } from '~/core/profile/use-person-positions';

import { EditRecordDialog } from './edit-record-dialog';
import { ProfileHeadline } from './profile-headline';
import { ProfileRecentSection } from './profile-recent-section';
import { ProfileRecordSection, ProfileSkillsSection } from './profile-record-sections';

type Props = {
  /** The personal space being viewed. Every count keys on this. */
  spaceId: string;
  /** The person entity. Presentation hangs off this. */
  personEntityId: string;
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

      {/*
       * What they have argued and taken a position on lately. Below the history
       * because the history is what a profile is asked for first; above nothing,
       * because each is a link into its own tab rather than the tab itself.
       */}
      <RecentDebates spaceId={spaceId} />
      <RecentClaims spaceId={spaceId} />

      <EditRecordDialog
        kind={editing}
        onOpenChange={() => setEditing(null)}
        entityId={personEntityId}
        spaceId={spaceId}
      />
    </div>
  );
}

function RecentDebates({ spaceId }: { spaceId: string }) {
  const { rows, isLoading } = usePersonDebates(spaceId, true);

  return (
    <ProfileRecentSection
      title="Recent debates"
      rows={rows}
      isLoading={isLoading}
      href={`/space/${spaceId}/debates`}
      seeAllLabel="See all debates"
    />
  );
}

function RecentClaims({ spaceId }: { spaceId: string }) {
  // The first page is all this needs, and it is the same query the Positions tab
  // opens with — so moving between them costs no request.
  const { rows, isLoading } = usePersonPositions({ spaceId });

  return (
    <ProfileRecentSection
      title="Recent claims"
      rows={rows}
      isLoading={isLoading}
      href={`/space/${spaceId}/positions`}
      seeAllLabel="See all claims"
    />
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
