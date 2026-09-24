'use client';

import * as React from 'react';

import { usePersonDebates } from '~/core/debates/use-person-debates';
import { usePersonalSpaceId } from '~/core/hooks/use-personal-space-id';
import { useProfileFacts } from '~/core/hooks/use-profile-facts';
import { useProfileHistory } from '~/core/hooks/use-profile-history';
import { spaceLabel, useSpaceLabels } from '~/core/hooks/use-space-labels';
import { ID } from '~/core/id';
import { collectSkills, currentRoles } from '~/core/profile/profile-summary';
import { DEFAULT_DEBATE_SORT, sortRows } from '~/core/profile/record-client-filter';
import { useEntityScores } from '~/core/profile/use-entity-scores';
import { heldPositionsCount, usePersonPositions, usePersonResponses } from '~/core/profile/use-person-positions';
import { useProfileDebateVisibility } from '~/core/profile/use-profile-debate-visibility';
import { normId } from '~/core/utils/norm-id';

import { EditRecordDialog } from './edit-record-dialog';
import { type ActivityKind, ProfileActivitySection } from './profile-activity-section';
import { ProfileDebateVisibilityButton } from './profile-debate-visibility-button';
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
  // Held rather than cleared on close, so a failed publish can reopen on the
  // section it was editing. `EditRecordDialog` calls `onOpenChange(true)` when a
  // publish fails — the staged rows survive and the dialog is the only place to
  // retry them — and a handler that ignored the boolean made that call a no-op.
  const [editing, setEditing] = React.useState<'employment' | 'education' | null>(null);
  const lastEdited = React.useRef<'employment' | 'education'>('employment');

  const openEditor = (kind: 'employment' | 'education') => {
    lastEdited.current = kind;
    setEditing(kind);
  };

  const skills = React.useMemo(
    () => collectSkills(history.employment, history.education),
    [history.employment, history.education]
  );

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
      <ProfileActivity spaceId={spaceId} personEntityId={personEntityId} isOwner={isOwner} />

      {/* A failed history read is not an empty account. Keep its own sections
          unavailable so the owner cannot accidentally duplicate a hidden edge,
          without taking down the independently loaded activity above it. */}
      {history.isUnavailable ? (
        <p className="rounded-lg border border-dashed border-grey-02 px-3 py-4 text-center text-metadata text-grey-04">
          We couldn’t load this profile. Try reloading the page.
        </p>
      ) : (
        <>
          <ProfileRecordSection
            kind="employment"
            cards={history.employment}
            isOwner={isOwner}
            onEdit={() => openEditor('employment')}
            spaceId={spaceId}
            isLoading={history.isLoading}
          />
          <ProfileRecordSection
            kind="education"
            cards={history.education}
            isOwner={isOwner}
            onEdit={() => openEditor('education')}
            spaceId={spaceId}
            isLoading={history.isLoading}
          />
          <ProfileSkillsSection skills={skills} spaceId={spaceId} />

          <EditRecordDialog
            kind={editing}
            onOpenChange={open => setEditing(open ? lastEdited.current : null)}
            entityId={personEntityId}
            spaceId={spaceId}
          />
        </>
      )}
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
function ProfileActivity({
  spaceId,
  personEntityId,
  isOwner,
}: {
  spaceId: string;
  personEntityId: string;
  isOwner: boolean;
}) {
  const debates = usePersonDebates(spaceId, true);
  const visibility = useProfileDebateVisibility(spaceId);

  /*
   * Ranked the way the Debates tab opens, so "See all debates" leads to the same
   * six in the same order — one constant, not two literals that happen to match.
   *
   * Claims need no equivalent: `usePersonPositions` defaults to the sort its own
   * tab opens on, so asking it for nothing gets the tab's order.
   */
  const debateIds = React.useMemo(() => debates.rows.map(row => row.entityId), [debates.rows]);
  const { rankings, isLoading: isLoadingRanks, isError: isRanksError } = useEntityScores({ ids: debateIds });
  const rankedDebates = React.useMemo(
    () => sortRows(debates.rows, DEFAULT_DEBATE_SORT, { rankings }),
    [debates.rows, rankings]
  );
  const positions = usePersonPositions({ spaceId });
  const { facts, isLoading: isLoadingFacts, isError: isFactsError } = useProfileFacts({ spaceId, personEntityId });

  // The rail's own source, so the card and the number beside it cannot disagree
  // — and neither counts a position that has been taken back. Same query key as
  // `positions` above, so no extra request.
  const responses = usePersonResponses({ spaceId });
  const positionsCount = heldPositionsCount(responses, facts.positions);

  // A personal space is named by its Person entity, which is where the response
  // tags get "Susan agreed" from. The same lookup the gallery already makes for
  // its space chips, so it costs nothing.
  const selfSpace = React.useMemo(() => [spaceId], [spaceId]);
  const { labelsById } = useSpaceLabels(selfSpace);
  const personName = spaceLabel(labelsById, spaceId)?.name ?? null;

  const kinds: ActivityKind[] = [
    {
      key: 'debates',
      label: 'Debates',
      rows: rankedDebates,
      total: facts.debates,
      // The count and the rows are separate requests, so both halves of the
      // facts query's state have to reach the card: without `isLoading` the
      // rows rendered under a confident 0 while the count was still out, and
      // without `isError` they render under one forever if it failed.
      // The ranks too, or the row reshuffles under the reader — see the tab.
      // Not when the lookup *failed*, which would hold a loading state forever
      // over rows that arrived perfectly well; those simply keep their incoming
      // order, which is what `sortRows` does with no ranks.
      isLoading: debates.isLoading || isLoadingFacts || (isLoadingRanks && !isRanksError),
      isCountUnavailable: isFactsError,
      isError: debates.isError,
      href: `/space/${spaceId}/debates`,
      seeAllLabel: 'View all debates',
      debateEndSlot: isOwner
        ? item => {
            const id = normId(item.entityId);
            return (
              <ProfileDebateVisibilityButton
                hidden={false}
                pending={visibility.pendingIds.has(id)}
                onClick={() => void visibility.setHidden(item, debates.hiddenRelationsByDebateId.get(id) ?? [], true)}
              />
            );
          }
        : undefined,
    },
    {
      key: 'claims',
      label: 'Claims',
      rows: positions.rows,
      responseByClaimId: positions.responseByClaimId,
      personName,
      total: positionsCount ?? 0,
      isLoading: positions.isLoading || isLoadingFacts || positionsCount === null,
      // Both sources have to fail before the count is gone: the vote table can
      // answer it on its own, and does.
      isCountUnavailable: isFactsError && responses.isError,
      isError: positions.isError,
      href: `/space/${spaceId}/positions`,
      seeAllLabel: 'View all claims',
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
