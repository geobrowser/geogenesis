'use client';

import { personalSpace } from '@geoprotocol/geo-sdk';
import { IdUtils, Position } from '@geoprotocol/geo-sdk/lite';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import * as React from 'react';

import { Duration, Effect, Either, Schedule } from 'effect';

import type { Debate, DebateParticipant } from '~/core/debates/api';
import { useGeoChatAuth } from '~/core/debates/hooks';
import {
  NAME_PROPERTY_ID,
  TYPES_PROPERTY_ID,
  VOTE_DEBATES_PROPERTY_ID,
  VOTE_TYPE_ID,
  VOTE_WINNER_PROPERTY_ID,
} from '~/core/debates/ontology';
import { orderedParticipants, speakerLabel } from '~/core/debates/playback-utils';
import { type DebateVoteRecord, tallyDebateVotes, voteSharePercentages } from '~/core/debates/vote-tally';
import { TransactionWriteFailedError } from '~/core/errors';
import { usePrivySignIn } from '~/core/hooks/use-privy-sign-in';
import { ID } from '~/core/id';
import { checkEntityExists, getDebateVoteEntities } from '~/core/io/queries';
import { fetchProfilesBySpaceIds } from '~/core/io/subgraph/fetch-profile';
import { useEnqueuePendingAction } from '~/core/state/pending-actions';
import { useReportError } from '~/core/state/status-bar-store';
import type { Entity, Relation, Value } from '~/core/types';
import { toUserFacingError } from '~/core/utils/error-diagnostics';
import { Publish } from '~/core/utils/publish';

import { useGeoProfile } from '../hooks/use-geo-profile';
import { usePersonalSpaceId } from '../hooks/use-personal-space-id';
import { useSmartAccount } from '../hooks/use-smart-account';
import { useToast } from '../hooks/use-toast';

const votesQueryKey = (debateEntityId: string) => ['debate-votes', debateEntityId] as const;

/**
 * Shared across every mounted copy of the hook: the feed and claims panel both mount
 * `useDebateVotes` for the same debate, so a local `useState` would leave the other surface's
 * pills enabled mid-publish.
 */
const debatesWithVoteInFlight = new Set<string>();
const voteInFlightListeners = new Set<() => void>();

export function resetDebateVotePublishStateForTests() {
  debatesWithVoteInFlight.clear();
}

function setVoteInFlight(debateEntityId: string, inFlight: boolean) {
  if (inFlight) debatesWithVoteInFlight.add(debateEntityId);
  else debatesWithVoteInFlight.delete(debateEntityId);
  for (const listener of voteInFlightListeners) listener();
}

function subscribeToVoteInFlight(listener: () => void) {
  voteInFlightListeners.add(listener);
  return () => {
    voteInFlightListeners.delete(listener);
  };
}

function useVoteInFlight(debateEntityId: string): boolean {
  return React.useSyncExternalStore(
    subscribeToVoteInFlight,
    () => debatesWithVoteInFlight.has(debateEntityId),
    () => false
  );
}

function retrySchedule(maxDuration: Duration.DurationInput) {
  return Schedule.exponential('100 millis').pipe(
    Schedule.jittered,
    Schedule.compose(Schedule.elapsed),
    Schedule.whileOutput(Duration.lessThanOrEqualTo(Duration.decode(maxDuration)))
  );
}

/** Flatten a fetched Vote entity into the fields the tally needs. */
function parseVoteEntity(entity: Entity): DebateVoteRecord | null {
  const winner = entity.relations.find(relation => ID.equals(relation.type.id, VOTE_WINNER_PROPERTY_ID));
  // Counting a Vote with no winner relation would pad the total without crediting anyone.
  if (!winner) return null;

  const voterSpaceId = entity.spaces[0];
  if (!voterSpaceId) return null;

  return {
    id: entity.id,
    voterSpaceId,
    winnerSpaceEntityId: winner.toEntity.id,
    winnerName: null,
    winnerRelationId: winner.id,
  };
}

async function fetchDebateVotes(
  debateEntityId: string,
  signal?: AbortController['signal']
): Promise<DebateVoteRecord[]> {
  const entities = await Effect.runPromise(getDebateVoteEntities(debateEntityId, signal));
  const votes = entities.map(parseVoteEntity).filter((vote): vote is DebateVoteRecord => vote !== null);
  if (votes.length === 0) return votes;

  // The winner relation points at a personal space's *system* entity, whose name is a
  // technical record ("Space 2980ce95-…") or null. The display name lives on the space's
  // page entity, which is what the profile endpoint resolves.
  const profiles = await Effect.runPromise(fetchProfilesBySpaceIds(votes.map(vote => vote.winnerSpaceEntityId)));
  const nameBySpaceId = new Map(profiles.map(profile => [ID.uuidToHex(profile.spaceId), profile.name]));

  return votes.map(vote => ({
    ...vote,
    winnerName: nameBySpaceId.get(ID.uuidToHex(vote.winnerSpaceEntityId)) ?? null,
  }));
}

/**
 * Who a set of voters picked as the winner of a debate, so a comment can be badged with
 * its author's vote. Returns an empty map for anything that isn't a published Debate.
 */
export function useDebateVotesByVoter(debateEntityId: string | null, enabled: boolean) {
  const { data } = useQuery({
    queryKey: votesQueryKey(debateEntityId ?? ''),
    queryFn: ({ signal }) => fetchDebateVotes(debateEntityId!, signal),
    enabled: enabled && !!debateEntityId,
  });

  return React.useMemo(() => tallyDebateVotes(data ?? [], null).votesByVoterSpaceId, [data]);
}

export type DebateVotesResult = {
  /** Whole-number vote share for a debater, or null until the viewer has voted. */
  sharePercentFor: (participant: DebateParticipant) => number | null;
  /** True for the debater this viewer picked. */
  isMyPick: (participant: DebateParticipant) => boolean;
  hasVoted: boolean;
  isVoting: boolean;
  castVote: (participant: DebateParticipant) => Promise<void>;
};

/**
 * Voting on who won a debate.
 *
 * A vote is a GRC-20 Vote entity pointing at the Debate and at the winner's personal-space
 * system entity. It's published to the voter's own personal space, down the same auto-publish
 * path comments take, so the tally is read back from the debate's backlinks across every
 * voter's space rather than from geo-chat.
 */
export function useDebateVotes(debate: Debate): DebateVotesResult {
  const { smartAccount, isLoading: isAccountLoading, error: accountError } = useSmartAccount();
  const openPrivySignIn = usePrivySignIn();
  const { ready: authReady, authenticated } = useGeoChatAuth();
  const enqueuePendingAction = useEnqueuePendingAction();
  // Lets the queued replay reach the current `castVote` without making the callback depend on
  // itself. The runner only fires it once a personal space exists, so the replay lands past the
  // branch that queued it.
  const castVoteRef = React.useRef<(participant: DebateParticipant) => Promise<void>>(async () => {});
  const { personalSpaceId } = usePersonalSpaceId();
  const queryClient = useQueryClient();
  const [, setToast] = useToast();
  const reportError = useReportError();
  const pollGenerationRef = React.useRef(0);

  // A Debate entity's id is its geo-chat debate id, so votes hang off it without a lookup.
  const debateEntityId = ID.uuidToHex(debate.id);
  const isVoting = useVoteInFlight(debateEntityId);
  const { profile } = useGeoProfile(smartAccount?.account.address);

  const { data: votes } = useQuery({
    queryKey: votesQueryKey(debateEntityId),
    queryFn: ({ signal }) => fetchDebateVotes(debateEntityId, signal),
  });

  const tally = React.useMemo(() => tallyDebateVotes(votes ?? [], personalSpaceId), [votes, personalSpaceId]);

  const hasVoted = tally.myVote !== null;

  // Apportioned across all the debaters at once so the numbers on screen add up to 100.
  const sharesBySpaceEntityId = React.useMemo(() => {
    const participants = orderedParticipants(debate);
    const counts = participants.map(p => tally.countsBySpaceEntityId.get(ID.uuidToHex(p.profile_space_id)) ?? 0);
    const shares = voteSharePercentages(counts);
    return new Map(participants.map((p, index) => [ID.uuidToHex(p.profile_space_id), shares[index]]));
  }, [debate, tally.countsBySpaceEntityId]);

  const sharePercentFor = React.useCallback(
    (participant: DebateParticipant): number | null => {
      if (!hasVoted) return null;
      return sharesBySpaceEntityId.get(ID.uuidToHex(participant.profile_space_id)) ?? 0;
    },
    [hasVoted, sharesBySpaceEntityId]
  );

  const isMyPick = React.useCallback(
    (participant: DebateParticipant) =>
      tally.myVote !== null && ID.equals(tally.myVote.winnerSpaceEntityId, participant.profile_space_id),
    [tally.myVote]
  );

  const castVote = React.useCallback(
    async (participant: DebateParticipant) => {
      if (debatesWithVoteInFlight.has(debateEntityId)) return;

      const previousVote = tally.myVote;
      if (previousVote && ID.equals(previousVote.winnerSpaceEntityId, participant.profile_space_id)) return;
      if (previousVote && previousVote.winnerRelationId == null) return;

      if (!smartAccount) {
        // Null covers three different situations — signed out, still restoring, and a failed
        // initialization — and only the first is an invitation to log in. Privy is the authority
        // on which one this is, and sending a signed-in viewer through login would clear their
        // half-finished onboarding.
        if (authReady && !authenticated) {
          // Keep the pick. Signing in is a detour, and coming back to an unchanged debate with
          // the vote silently dropped is worse than the toast this replaced. The runner replays
          // it once there is a personal space to write from, which is what the vote needs and
          // what finishing onboarding produces.
          enqueuePendingAction({
            id: `debate-winner-vote:${debateEntityId}`,
            label: 'your winner vote',
            requires: 'personalSpace',
            run: () => castVoteRef.current(participant),
          });
          // Signed out is a step, not an error: open the login the upvote control opens rather
          // than a toast that names the problem and leaves them to find the way in.
          openPrivySignIn();
          return;
        }
        if (accountError) {
          reportError('Your account could not be loaded, so the vote was not sent. Please reload and try again.');
          return;
        }
        if (isAccountLoading || !authReady) return;
        // Signed in with no usable account and nothing reporting why. Better a toast than a login
        // that cannot help.
        setToast(<span>Your account is not ready to vote yet. Please try again in a moment.</span>);
        return;
      }
      if (!personalSpaceId) {
        setToast(<span>Personal space required to vote. Please complete onboarding.</span>);
        return;
      }

      const winnerName = speakerLabel(participant);
      const voterName = profile?.name ?? 'Anonymous';
      const debateName = debate.claim.claim;
      const voteEntityId = previousVote?.id ?? IdUtils.generate();
      const voteName = `${voterName} votes ${winnerName} on ${debateName}`;
      const previousWinnerRelationId = previousVote?.winnerRelationId ?? null;

      const values: Value[] = [
        {
          id: ID.createValueId({ entityId: voteEntityId, propertyId: NAME_PROPERTY_ID, spaceId: personalSpaceId }),
          entity: { id: voteEntityId, name: voteName },
          property: { id: NAME_PROPERTY_ID, name: 'Name', dataType: 'TEXT' },
          spaceId: personalSpaceId,
          value: voteName,
          isLocal: true,
          hasBeenPublished: false,
        },
      ];

      const relate = (propertyId: string, propertyName: string, toId: string, toName: string | null): Relation => ({
        id: IdUtils.generate(),
        entityId: IdUtils.generate(),
        spaceId: personalSpaceId,
        renderableType: 'RELATION',
        position: Position.generate(),
        type: { id: propertyId, name: propertyName },
        fromEntity: { id: voteEntityId, name: voteName },
        toEntity: { id: toId, name: toName, value: toId },
        isLocal: true,
        hasBeenPublished: false,
      });

      const anchorRelations: Relation[] = [
        relate(TYPES_PROPERTY_ID, 'Types', VOTE_TYPE_ID, 'Vote'),
        relate(VOTE_DEBATES_PROPERTY_ID, 'Debates', debateEntityId, debateName),
      ];

      const newWinnerRelation = relate(VOTE_WINNER_PROPERTY_ID, 'Vote', participant.profile_space_id, winnerName);

      const relations: Relation[] = [...anchorRelations];
      if (previousVote) {
        relations.push({
          ...relate(VOTE_WINNER_PROPERTY_ID, 'Vote', previousVote.winnerSpaceEntityId, previousVote.winnerName),
          id: previousWinnerRelationId!,
          isDeleted: true,
        });
      }
      relations.push(newWinnerRelation);

      // Keep the new relation id on the optimistic row so a switch during the indexer lag can
      // still delete it.
      const optimisticVote: DebateVoteRecord = {
        id: voteEntityId,
        voterSpaceId: personalSpaceId,
        winnerSpaceEntityId: participant.profile_space_id,
        winnerName,
        winnerRelationId: newWinnerRelation.id,
      };

      const pollGeneration = ++pollGenerationRef.current;

      queryClient.setQueryData<DebateVoteRecord[]>(votesQueryKey(debateEntityId), (old = []) => [
        ...old.filter(vote => vote.id !== voteEntityId),
        optimisticVote,
      ]);

      setVoteInFlight(debateEntityId, true);

      const publish = Effect.gen(function* () {
        const ops = yield* Publish.prepareLocalDataForPublishing(values, relations, personalSpaceId);
        if (ops.length === 0) throw new Error('No operations to publish');

        const result = yield* Effect.retry(
          Effect.tryPromise({
            try: () =>
              personalSpace.publishEdit({
                name: `Vote: ${voteName}`,
                spaceId: personalSpaceId,
                ops,
                author: personalSpaceId,
                network: 'TESTNET',
              }),
            catch: error => new TransactionWriteFailedError('IPFS upload failed', { cause: error }),
          }),
          retrySchedule(Duration.minutes(1))
        );

        return yield* Effect.retry(
          Effect.tryPromise({
            try: () => smartAccount.sendUserOperation({ calls: [{ to: result.to, value: 0n, data: result.calldata }] }),
            catch: error => new TransactionWriteFailedError('Transaction failed', { cause: error }),
          }),
          retrySchedule(Duration.seconds(10))
        );
      });

      try {
        const result = await Effect.runPromise(Effect.either(publish));

        if (Either.isLeft(result)) {
          // Publish failed — restore the previous pick, or clear on a failed first vote.
          queryClient.setQueryData<DebateVoteRecord[]>(votesQueryKey(debateEntityId), (old = []) => {
            const live = old.find(vote => vote.id === voteEntityId);
            if (live && live.winnerRelationId !== optimisticVote.winnerRelationId) return old;

            const withoutOptimistic = old.filter(vote => vote.id !== voteEntityId);
            return previousVote ? [...withoutOptimistic, previousVote] : withoutOptimistic;
          });

          const error = result.left;
          if (error instanceof Error && error.message.includes('User rejected')) return;

          console.error('[useDebateVotes] Publish failed:', error);
          const { message, retry } = toUserFacingError(error, 'Failed to publish vote: ');
          reportError(message, retry);
          return;
        }

        setToast(<span>Vote published!</span>);
      } finally {
        setVoteInFlight(debateEntityId, false);
      }

      // The indexer lags the chain. Invalidating now would drop the optimistic row and flash
      // "Winner?" back on, so wait until our own vote is readable first.
      const FIRST_POLL_MS = 1500;
      const POLL_INTERVAL_MS = 2000;
      const MAX_POLL_ATTEMPTS = 45;
      const sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

      const isVoteIndexed = async () => {
        if (!previousVote) return await Effect.runPromise(checkEntityExists(voteEntityId));
        const indexed = tallyDebateVotes(await fetchDebateVotes(debateEntityId), personalSpaceId).myVote;
        return indexed !== null && ID.equals(indexed.winnerSpaceEntityId, participant.profile_space_id);
      };

      void (async () => {
        await sleep(FIRST_POLL_MS);
        for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt++) {
          if (pollGeneration !== pollGenerationRef.current) return;
          try {
            if (await isVoteIndexed()) break;
          } catch (error) {
            console.error('[useDebateVotes] Poll for indexed vote failed:', error);
          }
          await sleep(POLL_INTERVAL_MS);
        }
        if (pollGeneration !== pollGenerationRef.current) return;
        await queryClient.invalidateQueries({ queryKey: votesQueryKey(debateEntityId) });
        // Choosing a winner is an onboarding step, and the card caches for a minute — long enough
        // that returning to Explore straight after voting can still show it unticked. This is the
        // moment the vote is known to be indexed, so it is the moment the step became true
        // (GEO-2800).
        void queryClient.invalidateQueries({ queryKey: ['curator-onboarding-status'] });
      })();
    },
    [
      tally.myVote,
      smartAccount,
      personalSpaceId,
      profile?.name,
      debate.claim.claim,
      debateEntityId,
      queryClient,
      openPrivySignIn,
      enqueuePendingAction,
      authReady,
      authenticated,
      isAccountLoading,
      accountError,
      setToast,
      reportError,
    ]
  );

  castVoteRef.current = castVote;

  return { sharePercentFor, isMyPick, hasVoted, isVoting, castVote };
}
