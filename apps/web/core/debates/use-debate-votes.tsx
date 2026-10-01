'use client';

import { personalSpace } from '@geoprotocol/geo-sdk';
import { IdUtils, Position } from '@geoprotocol/geo-sdk/lite';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import * as React from 'react';

import { Duration, Effect, Either, Schedule } from 'effect';

import { withActionContext } from '~/core/action-context';
import { useActionContext } from '~/core/action-context-provider';
import { classifyOperationFailure, observeOperation } from '~/core/analytics-operations';
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
import {
  useDequeuePendingAction,
  useEnqueuePendingAction,
  useLivePendingActionHandler,
  usePendingActionIntent,
} from '~/core/state/pending-actions';
import { useReportError } from '~/core/state/status-bar-store';
import type { Entity, Relation, Value } from '~/core/types';
import { toUserFacingError } from '~/core/utils/error-diagnostics';
import { Publish } from '~/core/utils/publish';

import { readCachedPersonalSpace, readCachedSmartAccount } from '../hooks/cached-write-identity';
import { useGeoProfile } from '../hooks/use-geo-profile';
import { usePersonalSpaceId } from '../hooks/use-personal-space-id';
import { useSmartAccount } from '../hooks/use-smart-account';
import { useToast } from '../hooks/use-toast';

const votesQueryKey = (debateEntityId: string) => ['debate-votes', debateEntityId] as const;

/**
 * Shared across every mounted copy of the hook: the same debate can be open in more than one
 * surface, so a local `useState` would leave the other surface's pills enabled mid-publish.
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
  castVote: (participant: DebateParticipant, options?: CastVoteOptions) => Promise<void>;
};

type CastVoteOptions = {
  /**
   * Set when the pending-actions runner is replaying a vote queued before the account was ready.
   * A replay that still cannot publish throws instead of toasting, so the runner keeps it queued
   * and offers a retry — returning quietly told the runner it had succeeded, and the vote was gone.
   */
  fromQueue?: boolean;
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
  const getContext = useActionContext('winner_vote_button', 'debate', debate.id, { debate_id: debate.id });
  const { smartAccount, isLoading: isAccountLoading, error: accountError } = useSmartAccount();
  const openPrivySignIn = usePrivySignIn();
  const { ready: authReady, authenticated } = useGeoChatAuth();
  const enqueuePendingAction = useEnqueuePendingAction('winner_vote_button');
  const dequeuePendingAction = useDequeuePendingAction();
  // Lets the queued replay reach the current `castVote` without making the callback depend on
  // itself. The runner only fires it once a personal space exists, so the replay lands past the
  // branch that queued it.
  const castVoteRef = React.useRef<(participant: DebateParticipant, options?: CastVoteOptions) => Promise<void>>(
    async () => {}
  );
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

  // A pick made before the account could publish, read off the queue so it is still drawn after the
  // panel or card that took it remounts during sign-up. Once the write starts, the optimistic row it
  // puts in the votes cache takes over.
  const queuedVoteId = `debate-winner-vote:${debateEntityId}`;
  const queuedWinner = usePendingActionIntent(queuedVoteId);

  const isMyPick = React.useCallback(
    (participant: DebateParticipant) =>
      queuedWinner !== undefined
        ? ID.equals(queuedWinner, participant.profile_space_id)
        : tally.myVote !== null && ID.equals(tally.myVote.winnerSpaceEntityId, participant.profile_space_id),
    [queuedWinner, tally.myVote]
  );

  // Replayed through the hook mounted now when there is one: its tally knows the viewer's existing
  // vote, which the press's closure — taken signed out — could not, and a switch needs it.
  useLivePendingActionHandler(queuedVoteId, intent => {
    const participant = orderedParticipants(debate).find(p => intent && ID.equals(p.profile_space_id, intent));
    if (!participant) throw new Error('The debater you picked is no longer in this debate.');
    return castVoteRef.current(participant, { fromQueue: true });
  });

  const queueVote = React.useCallback(
    (participant: DebateParticipant) =>
      enqueuePendingAction({
        id: queuedVoteId,
        label: 'your winner vote',
        requires: 'personalSpace',
        intent: participant.profile_space_id,
        run: () => castVoteRef.current(participant, { fromQueue: true }),
      }),
    [enqueuePendingAction, queuedVoteId]
  );

  const castVote = React.useCallback(
    async (participant: DebateParticipant, { fromQueue = false }: CastVoteOptions = {}) => {
      const attribution = getContext();
      if (debatesWithVoteInFlight.has(debateEntityId)) return;

      const previousVote = tally.myVote;
      if (previousVote && ID.equals(previousVote.winnerSpaceEntityId, participant.profile_space_id)) return;
      if (previousVote && previousVote.winnerRelationId == null) return;

      // Read through the cache rather than only from this render. A queued vote replays through a
      // closure taken before sign-up, when neither existed yet; the cache has both by the time the
      // runner fires, the same fallback every other queued write uses.
      const account = readCachedSmartAccount(queryClient, smartAccount);
      const voterSpaceId =
        personalSpaceId ??
        (() => {
          const cached = readCachedPersonalSpace(queryClient, account?.account.address);
          return cached.isRegistered ? cached.personalSpaceId : null;
        })();

      if (!account) {
        if (fromQueue) throw new Error('Your account is not ready yet.');
        // Null covers three different situations — signed out, still restoring, and a failed
        // initialization — and only the first is an invitation to log in. Privy is the authority
        // on which one this is, and sending a signed-in viewer through login would clear their
        // half-finished onboarding.
        if (authReady && !authenticated) {
          // Keep the pick. Signing in is a detour, and coming back to an unchanged debate with
          // the vote silently dropped is worse than the toast this replaced. The runner replays
          // it once there is a personal space to write from, which is what the vote needs and
          // what finishing onboarding produces.
          const attempt = openPrivySignIn(
            {
              ...attribution,
              auth_control: 'pick_winner',
              auth_intent: 'vote',
              auth_continuation: 'queued',
            },
            // A dismissed sign-in withdraws the pick, so walking away never publishes it later.
            { onCancel: () => dequeuePendingAction(queuedVoteId) }
          );
          attribution.auth_attempt_id = attempt?.id;
          withActionContext(attribution, () => queueVote(participant));
          // Signed out is a step, not an error: open the login the upvote control opens rather
          // than a toast that names the problem and leaves them to find the way in.
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
      if (!voterSpaceId) {
        if (fromQueue) throw new Error('Your personal space is not ready yet.');
        // Signed in and the space is still being made: hold the pick for the runner, as the
        // signed-out path does, rather than asking for a second press once it exists.
        queueVote(participant);
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
          id: ID.createValueId({ entityId: voteEntityId, propertyId: NAME_PROPERTY_ID, spaceId: voterSpaceId }),
          entity: { id: voteEntityId, name: voteName },
          property: { id: NAME_PROPERTY_ID, name: 'Name', dataType: 'TEXT' },
          spaceId: voterSpaceId,
          value: voteName,
          isLocal: true,
          hasBeenPublished: false,
        },
      ];

      const relate = (propertyId: string, propertyName: string, toId: string, toName: string | null): Relation => ({
        id: IdUtils.generate(),
        entityId: IdUtils.generate(),
        spaceId: voterSpaceId,
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
        voterSpaceId: voterSpaceId,
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
      const operation = observeOperation('vote', 'debate', debateEntityId, undefined, attribution);
      const outcomeProperties: Record<string, unknown> = {
        vote_kind: 'winner',
        vote_direction: 'winner',
        mutation_kind: previousVote ? 'switch' : 'cast',
        vote_id: voteEntityId,
        winner_id: participant.profile_space_id,
        previous_winner_id: previousVote?.winnerSpaceEntityId ?? null,
      };

      const publish = Effect.gen(function* () {
        const ops = yield* Publish.prepareLocalDataForPublishing(values, relations, voterSpaceId);
        if (ops.length === 0) throw new Error('No operations to publish');

        const result = yield* Effect.retry(
          Effect.tryPromise({
            try: () =>
              personalSpace.publishEdit({
                name: `Vote: ${voteName}`,
                spaceId: voterSpaceId,
                ops,
                author: voterSpaceId,
                network: 'TESTNET',
              }),
            catch: error => new TransactionWriteFailedError('IPFS upload failed', { cause: error }),
          }),
          retrySchedule(Duration.minutes(1))
        );

        // The wallet retries known pre-submission failures. Repeating this whole
        // call after an uncertain response could submit the vote twice.
        return yield* Effect.tryPromise({
          try: () => account.sendUserOperation({ calls: [{ to: result.to, value: 0n, data: result.calldata }] }),
          catch: error => new TransactionWriteFailedError('Transaction failed', { cause: error }),
        });
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
          operation.failed(classifyOperationFailure(error));
          if (error instanceof Error && error.message.includes('User rejected')) return;

          console.error('[useDebateVotes] Publish failed:', error);
          const { message, retry } = toUserFacingError(error, 'Failed to publish vote: ');
          reportError(message, retry);
          return;
        }

        outcomeProperties.user_operation_hash = result.right;
        operation.outcome('vote_cast', 'submitted', outcomeProperties);
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
        const indexed = tallyDebateVotes(await fetchDebateVotes(debateEntityId), voterSpaceId).myVote;
        return indexed !== null && ID.equals(indexed.winnerSpaceEntityId, participant.profile_space_id);
      };

      void (async () => {
        await sleep(FIRST_POLL_MS);
        // The loop ends two ways — the vote became readable, or the attempts ran out — and only one
        // of them means anything is true yet.
        let voteIsReadable = false;
        for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt++) {
          if (pollGeneration !== pollGenerationRef.current) return;
          try {
            if (await isVoteIndexed()) {
              voteIsReadable = true;
              break;
            }
          } catch (error) {
            console.error('[useDebateVotes] Poll for indexed vote failed:', error);
          }
          await sleep(POLL_INTERVAL_MS);
        }
        if (pollGeneration !== pollGenerationRef.current) return;
        // Unconditional: on the timeout path this is what reconciles the optimistic row against
        // whatever the indexer actually has.
        await queryClient.invalidateQueries({ queryKey: votesQueryKey(debateEntityId) });

        // Choosing a winner is an onboarding step, and that card caches for a minute — long enough
        // that returning to Explore straight after voting can still show it unticked (GEO-2800).
        //
        // Only on success, though. Refetching the checklist while the vote is still unreadable
        // would answer `false` and mark that answer fresh for another minute, which is worse than
        // never asking: left alone, the card would have refetched on its next mount and had a
        // chance at the truth.
        if (voteIsReadable) {
          operation.outcome('vote_cast', 'indexed', outcomeProperties);
          void queryClient.invalidateQueries({ queryKey: ['curator-onboarding-status'] });
        }
      })();
    },
    [
      getContext,
      tally.myVote,
      smartAccount,
      personalSpaceId,
      profile?.name,
      debate.claim.claim,
      debateEntityId,
      queryClient,
      openPrivySignIn,
      queueVote,
      dequeuePendingAction,
      queuedVoteId,
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
