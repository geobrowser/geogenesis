'use client';

import { keepPreviousData } from '@tanstack/react-query';

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
import { type DebateVoteRecord, tallyDebateVotes, voteSharePercentages } from '~/core/debates/vote-tally';
import { useProfilesBySpaceIds } from '~/core/hooks/use-profiles-by-space-ids';
import { ID } from '~/core/id';
import { responsePositionLabel } from '~/core/responses/entity-response';
import { useQueryEntities } from '~/core/sync/use-store';
import type { Entity, Relation } from '~/core/types';
import { NavUtils } from '~/core/utils/utils';

import { Avatar } from '~/design-system/avatar';
import { GeoImage } from '~/design-system/geo-image';
import { PrefetchLink as Link } from '~/design-system/prefetch-link';
import { Skeleton } from '~/design-system/skeleton';
import { Text } from '~/design-system/text';

import { CursorPager, useCursorPages } from './use-cursor-pages';
import { useDebateKeyframes } from './use-debate-keyframes';

/**
 * Enough to show the claim has been argued without turning the page into a debate index, and how
 * many more arrive each time the reader asks.
 *
 * A claim usually collects a handful of debates, but nothing bounds it, so the section pages
 * rather than capping silently and quietly under-reporting.
 */
const DEBATE_PAGE_SIZE = 5;

export type DebateSide = { spaceId: string; position: boolean };

/**
 * How many votes are fetched for the whole section before the shares are withheld.
 *
 * One request covers every debate on the page, so this is a section-wide ceiling rather than a
 * per-debate one. Reaching it means the set is partial, and a winner drawn from a partial set is a
 * guess wearing a percentage.
 */
const VOTE_FETCH_CAP = 500;

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
  // A page at a time rather than an accumulating list: appending pushes everything below the
  // section down the page as the reader loads more, where swapping keeps the layout where they
  // left it.
  const pages = useCursorPages();
  const {
    entities: debates,
    isLoading,
    isPlaceholderData,
    endCursor,
    hasNextPage,
  } = useQueryEntities({
    where: {
      types: [{ id: { equals: DEBATE_TYPE_ID } }],
      spaces: [{ equals: spaceId }],
      relations: [{ typeOf: { id: { equals: DEBATE_CLAIMS_PROPERTY_ID } }, toEntity: { id: { equals: claimId } } }],
    },
    first: DEBATE_PAGE_SIZE,
    after: pages.cursor,
    // Holds the page being read while the next one loads, so stepping through doesn't blink the
    // section out and collapse the layout the pager exists to keep still.
    placeholderData: keepPreviousData,
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
  const keyframeByDebateId = useDebateKeyframes(debates);

  if (isLoading && debates.length === 0) {
    return <Skeleton className="h-[120px] w-full rounded-lg" />;
  }

  // Only on the first page: further in, an empty page still needs its pager so the reader can get
  // back out.
  if (debates.length === 0 && pages.isFirstPage) return null;

  return (
    <section aria-label="Debates on this claim">
      <Text as="h2" variant="smallTitle" color="text" className="mb-3 block">
        Debates on this claim
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
              keyframeUrl={keyframeByDebateId.get(debate.id) ?? null}
              responseKind={responseKind}
            />
          </li>
        ))}
      </ul>
      <CursorPager
        isFirstPage={pages.isFirstPage}
        hasNextPage={hasNextPage}
        // `keepPreviousData` leaves `isLoading` false while the previous page — and its now-stale
        // `endCursor` — are still on screen. Without this a second click on Next records that same
        // cursor again, and the trail Previous walks back through gains a duplicate.
        isLoading={isLoading || isPlaceholderData}
        onPrevious={pages.toPrevious}
        onNext={() => endCursor && pages.toNext(endCursor)}
      />
    </section>
  );
}

export type WinnerShare = {
  spaceId: string;
  percent: number;
  totalVotes: number;
  /**
   * Several debaters share the top count, so `spaceId` is one of them rather than the winner.
   * The leader is picked with a strict `>`, which on a tie keeps whichever was counted first —
   * fine for "who is ahead", wrong for anything that derives a win from it.
   */
  tied: boolean;
};

/**
 * Who each debate's viewers picked as the winner, as a share of that debate's votes.
 *
 * One query for every debate on screen rather than one per debate. Deliberately *not* space-scoped:
 * a Vote is auto-published into the voter's own personal space, so scoping to the claim's space
 * would find none of them.
 *
 * Counted through `tallyDebateVotes`, which collapses a voter's votes to one. A double-submit or a
 * retried publish can leave several Vote entities in one personal space for the same debate, and
 * counting the entities would let a single account inflate a total and, with it, decide the winner.
 * `voteSharePercentages` then rounds by largest remainder so the shares add to 100.
 */
export function useWinnerShares(debateIds: string[]): Map<string, WinnerShare> {
  return useWinnerSharesWithStatus(debateIds).shares;
}

/**
 * As `useWinnerShares`, but says whether the shares still describe the debates that were asked for.
 *
 * Retention is opt-in because it is only safe for a caller that reads one share per debate. A
 * caller deriving an aggregate across a *set* of debates — a person's win rate — would otherwise
 * compute it from whatever overlap the previous set happened to contain and show a number that is
 * simply wrong, which is worse than showing none. `isStale` is how such a caller knows to wait.
 */
export function useWinnerSharesWithStatus(
  debateIds: string[],
  { keepPreviousWhileLoading = false }: { keepPreviousWhileLoading?: boolean } = {}
): { shares: Map<string, WinnerShare>; isStale: boolean } {
  const { entities: votes, isPlaceholderData } = useQueryEntities({
    where: {
      types: [{ id: { equals: VOTE_TYPE_ID } }],
      relations: [{ typeOf: { id: { equals: VOTE_DEBATES_PROPERTY_ID } }, toEntity: { id: { in: debateIds } } }],
    },
    first: VOTE_FETCH_CAP,
    enabled: debateIds.length > 0,
    // The debate set is part of the key, so it changes whenever the caller's list does — paging a
    // browse page, or someone coming online on the People tab. Holding the previous answer keeps
    // shares on screen for debates that are still there instead of blanking every one of them.
    placeholderData: keepPreviousWhileLoading ? keepPreviousData : undefined,
  });

  const shares = React.useMemo(() => {
    // A truncated page is an arbitrary subset of the votes across every debate on screen, so any
    // share computed from it could name the wrong winner and would state a total that is simply
    // untrue. No share at all is the honest answer; a confidently wrong percentage is not.
    //
    // Suppressing rather than paging to completion is a deliberate trade. `getDebateVoteEntities`
    // walks every backlink page, but it does so per debate — five paginated fetches for a headline
    // stat on a secondary module, on every claim page view. If the cap ever starts being reached
    // in practice, that is the path to move to.
    if (votes.length >= VOTE_FETCH_CAP) return new Map<string, WinnerShare>();

    const recordsByDebateId = new Map<string, DebateVoteRecord[]>();
    // The tally keys winners by hex, so keep a way back to the id the profile lookup was given.
    const spaceIdByHex = new Map<string, string>();

    for (const vote of votes) {
      const debateId = relationTargets(vote.relations, VOTE_DEBATES_PROPERTY_ID)[0];
      const winnerSpaceEntityId = relationTargets(vote.relations, VOTE_WINNER_PROPERTY_ID)[0];
      // The space a Vote lives in is its voter, which is what one-vote-per-person is enforced on.
      const voterSpaceId = vote.spaces[0];
      if (!debateId || !winnerSpaceEntityId || !voterSpaceId) continue;

      spaceIdByHex.set(ID.uuidToHex(winnerSpaceEntityId), winnerSpaceEntityId);
      const records = recordsByDebateId.get(debateId) ?? [];
      records.push({
        id: vote.id,
        voterSpaceId,
        winnerSpaceEntityId,
        winnerName: null,
        winnerRelationId: null,
      });
      recordsByDebateId.set(debateId, records);
    }

    const shares = new Map<string, WinnerShare>();
    for (const [debateId, records] of recordsByDebateId) {
      const { countsBySpaceEntityId } = tallyDebateVotes(records, null);
      const entries = [...countsBySpaceEntityId.entries()];
      const totalVotes = entries.reduce((sum, [, count]) => sum + count, 0);
      if (totalVotes === 0) continue;

      const percentages = voteSharePercentages(entries.map(([, count]) => count));
      let leaderIndex = 0;
      entries.forEach(([, count], index) => {
        if (count > entries[leaderIndex]![1]) leaderIndex = index;
      });

      const leaderHex = entries[leaderIndex]![0];
      const leaderCount = entries[leaderIndex]![1];
      shares.set(debateId, {
        spaceId: spaceIdByHex.get(leaderHex) ?? leaderHex,
        percent: percentages[leaderIndex] ?? 0,
        totalVotes,
        tied: entries.filter(([, count]) => count === leaderCount).length > 1,
      });
    }
    return shares;
  }, [votes]);

  return { shares, isStale: isPlaceholderData };
}

export function DebateRow({
  debate,
  spaceId,
  sides,
  profilesBySpaceId,
  winnerShare,
  keyframeUrl,
  responseKind,
}: {
  debate: Entity;
  spaceId: string;
  sides: DebateSide[];
  profilesBySpaceId: Map<string, { name?: string | null; avatarUrl?: string | null }>;
  winnerShare: WinnerShare | null;
  keyframeUrl: string | null;
  responseKind: 'stance' | 'veracity';
}) {
  const nameFor = (participantSpaceId: string) => profilesBySpaceId.get(participantSpaceId)?.name ?? 'Unnamed debater';

  return (
    <Link
      href={NavUtils.toEntity(spaceId, debate.id)}
      className="flex items-center gap-3 rounded-lg border border-grey-02 bg-white p-3 transition-colors hover:border-grey-03"
    >
      {/* The still the debate was published with, in the shape the video actually is. The `Debate
          videos` property declares 540 × 820 — portrait, not the landscape a video thumbnail
          usually implies — so a 16:9 tile would letterbox every still it ever showed.

          A debate whose video predates keyframe capture keeps the neutral tile rather than an
          image element pointed at nothing. */}
      <span className="relative block aspect-[540/820] w-12 shrink-0 overflow-hidden rounded-md bg-grey-01 @[420px]:w-14">
        {keyframeUrl && <GeoImage value={keyframeUrl} alt="" fill sizes="56px" className="object-cover" />}
      </span>
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
        <DebateMeta debate={debate} totalVotes={winnerShare?.totalVotes ?? 0} />
      </div>

      {/* The outcome as its own column, so the eye can run down the percentages instead of hunting
          for them at the end of each row. */}
      {winnerShare && (
        <div className="shrink-0 text-right">
          <Text as="div" variant="metadataMedium" color="text" className="tabular-nums">
            {winnerShare.percent}%
          </Text>
          <Text as="div" variant="metadata" color="grey-04" className="truncate">
            {nameFor(winnerShare.spaceId)}
          </Text>
        </div>
      )}
    </Link>
  );
}

/**
 * Date and vote count under the debaters.
 *
 * Deliberately no duration: a debate's turn lengths live on geo-chat's record and were never
 * published to the graph, so there is nothing here to read one from. Showing a made-up or
 * zero-length runtime would be worse than leaving it out.
 *
 * Each part is dropped when it has nothing behind it, so the line never renders as a bare
 * separator — an unpublished date and an unvoted debate together mean no line at all.
 */
function DebateMeta({ debate, totalVotes }: { debate: Entity; totalVotes: number }) {
  const parts: string[] = [];

  const published = debateDate(debate);
  if (published) {
    parts.push(published.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }));
  }
  if (totalVotes > 0) parts.push(`${totalVotes} ${totalVotes === 1 ? 'vote' : 'votes'}`);

  if (parts.length === 0) return null;

  return (
    // The separator is its own element so it can carry real space on both sides. Joining on a
    // literal " · " left the parts crowding the dot, which read as one run-on string.
    <span className="flex flex-wrap items-center text-metadata text-grey-04 tabular-nums">
      {parts.map((part, index) => (
        <React.Fragment key={part}>
          {index > 0 && (
            <span aria-hidden className="mx-2 text-grey-03">
              ·
            </span>
          )}
          <span>{part}</span>
        </React.Fragment>
      ))}
    </span>
  );
}

/**
 * When the debate was published, as a date.
 *
 * `createdAt` and `updatedAt` are typed as "unix seconds or ISO 8601, varies by backend", so both
 * shapes are handled rather than assumed. `createdAt` is the one that means "when this debate
 * happened" — `updatedAt` moves whenever anything touches the entity, including a backlink from
 * some unrelated edit.
 */
function debateDate(debate: Entity): Date | null {
  const raw = debate.createdAt ?? debate.updatedAt;
  if (raw === undefined || raw === null) return null;

  const date = typeof raw === 'number' ? new Date(raw * 1000) : new Date(/^\d+$/.test(raw) ? Number(raw) * 1000 : raw);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function relationTargets(relations: Relation[], propertyId: string): string[] {
  return relations
    .filter(relation => relation.isDeleted !== true && ID.equals(relation.type.id, propertyId))
    .map(relation => relation.toEntity.id);
}
