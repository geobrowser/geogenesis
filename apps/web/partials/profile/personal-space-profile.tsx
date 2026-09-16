'use client';

import * as React from 'react';

import { usePersonDebates } from '~/core/debates/use-person-debates';
import { usePersonalSpaceId } from '~/core/hooks/use-personal-space-id';
import { useProfileFacts } from '~/core/hooks/use-profile-facts';
import { useProfileHistory } from '~/core/hooks/use-profile-history';
import { ID } from '~/core/id';
import { collectSkills, currentRoles } from '~/core/profile/profile-summary';
import { usePersonPositions } from '~/core/profile/use-person-positions';

import { EditRecordDialog } from './edit-record-dialog';
import { type ActivityKind, ProfileActivitySection } from './profile-activity-section';
import { ProfileHeadline } from './profile-headline';
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
      {/*
       * Activity first.
       *
       * The history is what a profile is *for*, but it is also the part that
       * changes least — and the question somebody arrives with is usually what
       * this person has been arguing about lately, which is the answer that goes
       * stale. It is one card tall either way, so leading with it costs the
       * history nothing.
       */}
      <ProfileActivity spaceId={spaceId} personEntityId={personEntityId} />

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
 * The Activity card's two kinds.
 *
 * Both read from the same queries their tabs open with, so moving between them
 * costs no request — and both counts come from the rail's own facts rather than
 * from the page in hand, which is one page of twenty against a real 192.
 */
function ProfileActivity({ spaceId, personEntityId }: { spaceId: string; personEntityId: string }) {
  const debates = usePersonDebates(spaceId, true);
  const positions = usePersonPositions({ spaceId });
  const { facts } = useProfileFacts({ spaceId, personEntityId });

  const kinds: ActivityKind[] = [
    {
      key: 'debates',
      label: 'Debates',
      rows: debates.rows,
      total: facts.debates,
      isLoading: debates.isLoading,
      href: `/space/${spaceId}/debates`,
      seeAllLabel: 'See all debates',
    },
    {
      key: 'claims',
      label: 'Claims',
      rows: positions.rows,
      total: facts.positions,
      isLoading: positions.isLoading,
      href: `/space/${spaceId}/positions`,
      seeAllLabel: 'See all claims',
    },
  ];

  return <ProfileActivitySection kinds={kinds} />;
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
