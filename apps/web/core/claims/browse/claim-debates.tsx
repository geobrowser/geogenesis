'use client';

import * as React from 'react';

import cx from 'classnames';

import {
  DEBATE_CLAIMS_PROPERTY_ID,
  DEBATE_OPPOSED_BY_PROPERTY_ID,
  DEBATE_SUPPORTED_BY_PROPERTY_ID,
  DEBATE_TYPE_ID,
  VOTE_DEBATES_PROPERTY_ID,
  VOTE_TYPE_ID,
  VOTE_WINNER_PROPERTY_ID,
} from '~/core/debates/ontology';
import { useProfilesBySpaceIds } from '~/core/hooks/use-profiles-by-space-ids';
import { ID } from '~/core/id';
import { responsePositionLabel } from '~/core/responses/entity-response';
import { useQueryEntities } from '~/core/sync/use-store';
import type { Entity, Relation } from '~/core/types';
import { NavUtils } from '~/core/utils/utils';

import { Avatar } from '~/design-system/avatar';
import { PrefetchLink as Link } from '~/design-system/prefetch-link';
import { Skeleton } from '~/design-system/skeleton';
import { Text } from '~/design-system/text';

/** Enough to show the claim has been argued without turning the page into a debate index. */
const MAX_DEBATES = 5;

type DebateSide = { spaceId: string; position: boolean };

/**
 * The debates that argued this claim.
 *
 * Space-scoped like the rest of the page: a debate is published into the space its claim lives in,
 * so the debates worth listing under this space's view of the claim are that space's.
 *
 * Renders nothing when the claim has never been debated. The invitation to be the first belongs
 * next to the readiness toggle, which is the control that acts on it — not in an empty module here.
 */
export function ClaimDebates({
  claimId,
  spaceId,
  responseKind,
}: {
  claimId: string;
  spaceId: string;
  /** Labels each debater's side in the claim's own vocabulary — Agree/Disagree or Verify/Dispute. */
  responseKind: 'stance' | 'veracity';
}) {
  const { entities: debates, isLoading } = useQueryEntities({
    where: {
      types: [{ id: { equals: DEBATE_TYPE_ID } }],
      spaces: [{ equals: spaceId }],
      relations: [{ typeOf: { id: { equals: DEBATE_CLAIMS_PROPERTY_ID } }, toEntity: { id: { equals: claimId } } }],
    },
    first: MAX_DEBATES,
  });

  const sidesByDebateId = React.useMemo(() => {
    const map = new Map<string, DebateSide[]>();
    for (const debate of debates) {
      map.set(debate.id, [
        ...relationTargets(debate.relations, DEBATE_SUPPORTED_BY_PROPERTY_ID).map(id => ({
          spaceId: id,
          position: true,
        })),
        ...relationTargets(debate.relations, DEBATE_OPPOSED_BY_PROPERTY_ID).map(id => ({
          spaceId: id,
          position: false,
        })),
      ]);
    }
    return map;
  }, [debates]);

  const participantSpaceIds = React.useMemo(
    () => [...new Set([...sidesByDebateId.values()].flat().map(side => side.spaceId))],
    [sidesByDebateId]
  );
  const { profilesBySpaceId } = useProfilesBySpaceIds(participantSpaceIds, participantSpaceIds.length > 0);

  const debateIds = React.useMemo(() => debates.map(debate => debate.id), [debates]);
  const winnerShareByDebateId = useWinnerShares(debateIds);

  if (isLoading) {
    return <Skeleton className="h-[120px] w-full rounded-lg" />;
  }

  if (debates.length === 0) return null;

  return (
    <section aria-label="Debates on this claim">
      <Text as="h2" variant="smallTitle" color="text" className="mb-3 block">
        {debates.length === 1 ? 'Debate on this claim' : 'Debates on this claim'}
      </Text>
      <ul className="m-0 flex list-none flex-col gap-2 p-0">
        {debates.map(debate => (
          <li key={debate.id}>
            <DebateRow
              debate={debate}
              spaceId={spaceId}
              sides={sidesByDebateId.get(debate.id) ?? []}
              profilesBySpaceId={profilesBySpaceId}
              winnerShare={winnerShareByDebateId.get(debate.id) ?? null}
              responseKind={responseKind}
            />
          </li>
        ))}
      </ul>
    </section>
  );
}

type WinnerShare = { spaceId: string; percent: number };

/**
 * Who each debate's viewers picked as the winner, as a share of that debate's votes.
 *
 * One query for every debate on screen rather than one per debate. Deliberately *not* space-scoped:
 * a Vote is auto-published into the voter's own personal space, so scoping to the claim's space
 * would find none of them.
 */
function useWinnerShares(debateIds: string[]): Map<string, WinnerShare> {
  const { entities: votes } = useQueryEntities({
    where: {
      types: [{ id: { equals: VOTE_TYPE_ID } }],
      relations: [{ typeOf: { id: { equals: VOTE_DEBATES_PROPERTY_ID } }, toEntity: { id: { in: debateIds } } }],
    },
    // A ceiling rather than a guess: the share is a headline, and paging every vote to refine a
    // rounded percentage would cost more than the precision is worth.
    first: 500,
    enabled: debateIds.length > 0,
  });

  return React.useMemo(() => {
    const tallies = new Map<string, Map<string, number>>();

    for (const vote of votes) {
      const debateId = relationTargets(vote.relations, VOTE_DEBATES_PROPERTY_ID)[0];
      const winnerSpaceId = relationTargets(vote.relations, VOTE_WINNER_PROPERTY_ID)[0];
      if (!debateId || !winnerSpaceId) continue;

      const byWinner = tallies.get(debateId) ?? new Map<string, number>();
      byWinner.set(winnerSpaceId, (byWinner.get(winnerSpaceId) ?? 0) + 1);
      tallies.set(debateId, byWinner);
    }

    const shares = new Map<string, WinnerShare>();
    for (const [debateId, byWinner] of tallies) {
      const total = [...byWinner.values()].reduce((sum, count) => sum + count, 0);
      if (total === 0) continue;

      const [leaderSpaceId, leaderCount] = [...byWinner.entries()].reduce((best, entry) =>
        entry[1] > best[1] ? entry : best
      );
      shares.set(debateId, { spaceId: leaderSpaceId, percent: Math.round((100 * leaderCount) / total) });
    }
    return shares;
  }, [votes]);
}

function DebateRow({
  debate,
  spaceId,
  sides,
  profilesBySpaceId,
  winnerShare,
  responseKind,
}: {
  debate: Entity;
  spaceId: string;
  sides: DebateSide[];
  profilesBySpaceId: Map<string, { name?: string | null; avatarUrl?: string | null }>;
  winnerShare: WinnerShare | null;
  responseKind: 'stance' | 'veracity';
}) {
  const nameFor = (participantSpaceId: string) => profilesBySpaceId.get(participantSpaceId)?.name ?? 'Unnamed debater';

  return (
    <Link
      href={NavUtils.toEntity(spaceId, debate.id)}
      className="flex items-center gap-3 rounded-lg border border-grey-02 bg-white p-3 transition-colors hover:border-grey-03"
    >
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        {sides.length > 0 ? (
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            {sides.map((side, index) => (
              <React.Fragment key={`${side.spaceId}-${String(side.position)}`}>
                {index > 0 && (
                  <Text as="span" variant="metadata" color="grey-03">
                    vs
                  </Text>
                )}
                <span className="flex min-w-0 items-center gap-1.5">
                  <span className="block size-5 shrink-0 overflow-hidden rounded-full bg-grey-02">
                    <Avatar avatarUrl={profilesBySpaceId.get(side.spaceId)?.avatarUrl} value={side.spaceId} size={20} />
                  </span>
                  <Text as="span" variant="metadataMedium" color="text" className="truncate">
                    {nameFor(side.spaceId)}
                  </Text>
                  <span
                    className={cx(
                      'shrink-0 rounded-xs px-1 py-px text-[0.6875rem] font-medium',
                      side.position ? 'bg-successTertiary text-text' : 'bg-errorTertiary text-text'
                    )}
                  >
                    {responsePositionLabel(responseKind, side.position)}
                  </span>
                </span>
              </React.Fragment>
            ))}
          </div>
        ) : (
          <Text as="span" variant="metadataMedium" color="text" className="truncate">
            {debate.name ?? 'Debate'}
          </Text>
        )}
        {winnerShare && (
          <Text as="span" variant="metadata" color="grey-04" className="tabular-nums">
            {winnerShare.percent}% picked {nameFor(winnerShare.spaceId)}
          </Text>
        )}
      </div>
    </Link>
  );
}

function relationTargets(relations: Relation[], propertyId: string): string[] {
  return relations
    .filter(relation => relation.isDeleted !== true && ID.equals(relation.type.id, propertyId))
    .map(relation => relation.toEntity.id);
}
