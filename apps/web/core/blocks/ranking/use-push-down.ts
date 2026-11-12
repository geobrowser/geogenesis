'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';

import * as React from 'react';

import { Effect } from 'effect';

import { usePersonalSpaceId } from '~/core/hooks/use-personal-space-id';
import { useSetToast } from '~/core/hooks/use-toast';
import { ID } from '~/core/id';
import { getBatchEntities, getUserEntityResponse } from '~/core/io/queries';
import { type ActiveResponseDirection, userEntityResponseQueryKey } from '~/core/responses/entity-response';
import { useQueryEntity } from '~/core/sync/use-store';

import { BEST_DEBATES_BLOCK_ID, BEST_DEBATES_RANKING_LIVE, DEBATES_SPACE_ID } from './best-debates';
import {
  IDLE_PUSH_DOWN_STATE,
  PUSH_DOWN_BALLOT_FAILED_COPY,
  PUSH_DOWN_LAST_BALLOT_ITEM_COPY,
  PUSH_DOWN_UNDONE_COPY,
  type PushDownAction,
  type PushDownRunResult,
  type PushDownState,
  RANK_BALLOT_FAILED_COPY,
  type StepResult,
  ballotHolds,
  ballotVoteSpaceIds,
  ballotWithout,
  debateOwnSpaceId,
  markPushDownNoteSeen,
  pushDownToastCopy,
  readPushDownNoteSeen,
  runVoteThenBallot,
} from './push-down';
import { invalidateBlockRankers } from './use-block-rankers';
import { useDebateDownvoteOverride, useDebateDownvoteWriter } from './use-debate-downvote';
import { useMyRanking } from './use-my-ranking';
import { useRankingSubmissions } from './use-ranking-submissions';

const BEST_DEBATES_BLOCK_NAME = 'Best debates';

export function pushDownStateQueryKey(personalSpaceId: string | null | undefined, debateId: string) {
  return ['push-down-state', personalSpaceId ?? null, ID.uuidToHex(debateId)] as const;
}

/**
 * The ballot publish a "Rank it" was waiting on when its second step failed, kept so Retry can
 * re-run it. Module scope because it is a function, and one debate has one at a time.
 */
const pendingRankPublishes = new Map<string, () => Promise<boolean>>();

export type UsePushDownOptions = {
  /** The ranking block. Defaults to `BEST_DEBATES_BLOCK_ID`; null switches push-down off. */
  blockId?: string | null;
  /**
   * The debate's own space, when the caller already knows it. Otherwise it is worked out from the
   * debate entity with `debateOwnSpaceId`.
   */
  debateSpaceId?: string | null;
};

export type UsePushDownResult = {
  /** False until the block exists, the member has a personal space and the debate's space is known. */
  enabled: boolean;
  /** The member's downvote is on the debate (or was just sent from this session). */
  isPushedDown: boolean;
  /** The debate is on the member's Best debates ballot. Both true = a failed second step. */
  isInBallot: boolean;
  /** The space the vote is recorded in: the debate's own, never the member's or the Debates space. */
  debateSpaceId: string | null;
  state: PushDownState;
  /** Push it down: downvote first, then, once that lands, take it off the ballot if it's there. */
  pushDown: () => Promise<PushDownRunResult>;
  /** Undo in the pushed-down list: clears the downvote. Leaves the ballot alone. */
  undo: () => Promise<PushDownRunResult>;
  /**
   * Rank a debate: clears the member's downvote first if there is one, then runs `publish`, the
   * caller's ballot publish (the compare flow's placement). `publish` resolves true once published.
   */
  rankAfterClearing: (publish: () => Promise<boolean>) => Promise<PushDownRunResult>;
  /** Re-runs the step that failed: the whole action after a failed vote, the ballot step otherwise. */
  retry: () => Promise<PushDownRunResult>;
};

const DISABLED: PushDownRunResult = { ok: false, step: 'vote', message: 'Push down isn’t available here.' };
const BUSY: PushDownRunResult = { ok: false, step: 'vote', message: 'Already working on it.' };

/**
 * Push a debate down on the Best debates ranking screen (GEO-3679), the entry point the Rank it /
 * Push it down choice (GEO-3678) calls: `pushDown` for its Push it down option, `rankAfterClearing`
 * around its Rank it publish.
 *
 * State is shared per (member, debate) through the query cache, so the choice dialog and the
 * pushed-down list read the same progress. Needs to sit inside a `DataBlockProvider`, as the ballot
 * write (`useRankingSubmissions`) does.
 */
export function usePushDown(debateId: string, options: UsePushDownOptions = {}): UsePushDownResult {
  const blockId = options.blockId === undefined ? BEST_DEBATES_BLOCK_ID : options.blockId;
  const isBlockSet = Boolean(blockId);
  const queryClient = useQueryClient();
  const setToast = useSetToast();
  const { personalSpaceId, isRegistered } = usePersonalSpaceId();

  const { entity: debateEntity } = useQueryEntity({
    id: debateId,
    enabled: isBlockSet && !options.debateSpaceId,
  });
  const debateSpaceId = options.debateSpaceId ?? debateOwnSpaceId(debateEntity, personalSpaceId);

  const { myRankEntity, orderedEntityIds } = useMyRanking(blockId ?? '');
  const { saveMySubmission } = useRankingSubmissions(blockId ?? '', DEBATES_SPACE_ID, BEST_DEBATES_BLOCK_NAME);
  const sendVote = useDebateDownvoteWriter();
  const override = useDebateDownvoteOverride(debateId);

  const enabled = isBlockSet && Boolean(personalSpaceId) && isRegistered && Boolean(debateSpaceId);

  const { data: serverResponse } = useQuery<ActiveResponseDirection | null>({
    queryKey: userEntityResponseQueryKey(personalSpaceId, debateId, debateSpaceId ?? '', 0, 'curation'),
    queryFn: () => Effect.runPromise(getUserEntityResponse(personalSpaceId!, debateId, debateSpaceId!, 'curation', 0)),
    enabled,
    staleTime: 30_000,
  });

  const isPushedDown = override === 'pushed' || (override !== 'cleared' && serverResponse === 'negative');
  const isInBallot = ballotHolds(orderedEntityIds, debateId);

  const stateKey = React.useMemo(() => pushDownStateQueryKey(personalSpaceId, debateId), [debateId, personalSpaceId]);
  const { data: state = IDLE_PUSH_DOWN_STATE } = useQuery<PushDownState>({
    queryKey: stateKey,
    queryFn: () => IDLE_PUSH_DOWN_STATE,
    // Seeded rather than fetched: a mount-time fetch resolving after a write would overwrite it.
    initialData: IDLE_PUSH_DOWN_STATE,
    staleTime: Infinity,
    gcTime: Infinity,
  });

  // The writes below run across several renders; they read the newest ballot and vote, not the
  // ones captured when the press happened.
  const latest = React.useRef({ orderedEntityIds, myRankEntity, isPushedDown, isInBallot, debateSpaceId, enabled });
  latest.current = { orderedEntityIds, myRankEntity, isPushedDown, isInBallot, debateSpaceId, enabled };

  const setState = React.useCallback(
    (next: PushDownState) => queryClient.setQueryData<PushDownState>(stateKey, next),
    [queryClient, stateKey]
  );
  const isWorking = () => queryClient.getQueryData<PushDownState>(stateKey)?.status === 'working';

  const downvote = React.useCallback(
    () =>
      sendVote({
        debateId,
        spaceId: latest.current.debateSpaceId!,
        direction: 'negative',
        analyticsAction: 'push_down',
        previousResponse: null,
      }),
    [debateId, sendVote]
  );
  const clearDownvote = React.useCallback(
    () =>
      sendVote({
        debateId,
        spaceId: latest.current.debateSpaceId!,
        direction: 'clear',
        analyticsAction: 'undo_push_down',
        previousResponse: 'negative',
      }),
    [debateId, sendVote]
  );

  const removeFromBallot = React.useCallback(async (): Promise<StepResult> => {
    const { orderedEntityIds: ballot, myRankEntity: rankEntity } = latest.current;
    if (!ballotHolds(ballot, debateId)) return { ok: true };
    const remaining = ballotWithout(ballot, debateId);
    if (remaining.length === 0) return { ok: false, message: PUSH_DOWN_LAST_BALLOT_ITEM_COPY };

    // Every other vote is re-sent, so each keeps the space it was ranked in.
    const spaces =
      rankEntity && personalSpaceId
        ? ballotVoteSpaceIds(rankEntity.relations ?? [], rankEntity.id, personalSpaceId)
        : new Map<string, string>();
    const unknown = remaining.filter(id => !spaces.has(ID.uuidToHex(id)));
    if (unknown.length > 0) {
      const entities = await Effect.runPromise(getBatchEntities(unknown));
      for (const entity of entities) {
        const own = debateOwnSpaceId(entity, personalSpaceId);
        if (own) spaces.set(ID.uuidToHex(entity.id), own);
      }
    }
    const slots = remaining.map(id => ({ id, name: null, spaceId: spaces.get(ID.uuidToHex(id)) }));
    if (slots.some(slot => !slot.spaceId)) return { ok: false, message: PUSH_DOWN_BALLOT_FAILED_COPY };

    const published = await saveMySubmission(slots);
    if (!published) return { ok: false, message: PUSH_DOWN_BALLOT_FAILED_COPY };
    // Ranker counts come from indexed ballots, so refresh them once indexing has settled.
    void published.indexingSettled.then(() => invalidateBlockRankers(queryClient, blockId!, DEBATES_SPACE_ID));
    return { ok: true };
  }, [blockId, debateId, personalSpaceId, queryClient, saveMySubmission]);

  const publishRanking = React.useCallback(async (publish: () => Promise<boolean>): Promise<StepResult> => {
    const published = await publish();
    if (!published) return { ok: false, message: RANK_BALLOT_FAILED_COPY };
    // The caller's publish owns its indexing wait; counts refresh when it invalidates them.
    return { ok: true };
  }, []);

  const run = React.useCallback(
    async (
      action: PushDownAction,
      steps: { vote: (() => Promise<StepResult>) | null; ballot: (() => Promise<StepResult>) | null }
    ): Promise<PushDownRunResult> => {
      const result = await runVoteThenBallot({
        ...steps,
        onStep: step => setState({ status: 'working', action, step }),
      });
      if (!result.ok) {
        setState({ status: 'failed', action, step: result.step, message: result.message });
        setToast(React.createElement('span', null, result.message));
        return result;
      }
      setState({ status: 'done', action });
      if (action === 'rank') pendingRankPublishes.delete(stateKey.join(':'));
      if (action === 'push-down') {
        const noteSeen = readPushDownNoteSeen();
        setToast(
          React.createElement('span', null, pushDownToastCopy({ rankingLive: BEST_DEBATES_RANKING_LIVE, noteSeen }))
        );
        if (BEST_DEBATES_RANKING_LIVE) markPushDownNoteSeen();
      }
      if (action === 'undo') setToast(React.createElement('span', null, PUSH_DOWN_UNDONE_COPY));
      return result;
    },
    [setState, setToast, stateKey]
  );

  const pushDown = React.useCallback(async () => {
    if (!latest.current.enabled) return DISABLED;
    if (isWorking()) return BUSY;
    const { isPushedDown: alreadyDown, isInBallot: ranked } = latest.current;
    return run('push-down', { vote: alreadyDown ? null : downvote, ballot: ranked ? removeFromBallot : null });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `isWorking` reads the cache directly.
  }, [downvote, removeFromBallot, run]);

  const undo = React.useCallback(async () => {
    if (!latest.current.enabled) return DISABLED;
    if (isWorking()) return BUSY;
    return run('undo', { vote: latest.current.isPushedDown ? clearDownvote : null, ballot: null });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `isWorking` reads the cache directly.
  }, [clearDownvote, run]);

  const rankAfterClearing = React.useCallback(
    async (publish: () => Promise<boolean>) => {
      if (!latest.current.enabled) return DISABLED;
      if (isWorking()) return BUSY;
      pendingRankPublishes.set(stateKey.join(':'), publish);
      return run('rank', {
        vote: latest.current.isPushedDown ? clearDownvote : null,
        ballot: () => publishRanking(publish),
      });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `isWorking` reads the cache directly.
    [clearDownvote, publishRanking, run, stateKey]
  );

  const retry = React.useCallback(async (): Promise<PushDownRunResult> => {
    const current = queryClient.getQueryData<PushDownState>(stateKey);
    if (!current || current.status !== 'failed') return { ok: true };
    if (current.step === 'vote') {
      if (current.action === 'push-down') return pushDown();
      if (current.action === 'undo') return undo();
      const publish = pendingRankPublishes.get(stateKey.join(':'));
      return publish ? rankAfterClearing(publish) : { ok: true };
    }
    // The vote already landed: only the ballot step is left.
    if (current.action === 'push-down') return run('push-down', { vote: null, ballot: removeFromBallot });
    const publish = pendingRankPublishes.get(stateKey.join(':'));
    if (current.action === 'rank' && publish) return run('rank', { vote: null, ballot: () => publishRanking(publish) });
    return { ok: true };
  }, [publishRanking, pushDown, queryClient, rankAfterClearing, removeFromBallot, run, stateKey, undo]);

  return {
    enabled,
    isPushedDown,
    isInBallot,
    debateSpaceId,
    state,
    pushDown,
    undo,
    rankAfterClearing,
    retry,
  };
}
