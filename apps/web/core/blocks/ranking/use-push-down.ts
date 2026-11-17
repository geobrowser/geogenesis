'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';

import * as React from 'react';

import { Effect } from 'effect';

import { usePersonalSpaceId } from '~/core/hooks/use-personal-space-id';
import { useSetToast } from '~/core/hooks/use-toast';
import { ID } from '~/core/id';
import { getBatchEntities } from '~/core/io/queries';
import { useQueryEntity } from '~/core/sync/use-store';

import {
  BEST_DEBATES_BLOCK_ID,
  BEST_DEBATES_PUSHDOWN_SINCE,
  BEST_DEBATES_RANKING_LIVE,
  DEBATES_SPACE_ID,
} from './best-debates';
import {
  type MemberVoteRecord,
  downvotedSpaceIds,
  fetchMemberDebateVotes,
  memberDebateVotesQueryKey,
} from './fetch-member-debate-votes';
import {
  IDLE_PUSH_DOWN_STATE,
  PUSH_DOWN_BALLOT_FAILED_COPY,
  PUSH_DOWN_UNDONE_COPY,
  type PushDownAction,
  type PushDownRunResult,
  type PushDownState,
  type PushDownStepRun,
  RANK_BALLOT_FAILED_COPY,
  type StepResult,
  VOTE_CHECK_FAILED_COPY,
  ballotHolds,
  ballotVoteSpaceIds,
  ballotWithout,
  debateOwnSpaceId,
  markPushDownNoteSeen,
  pushDownToastCopy,
  readPushDownNoteSeen,
  runInOrder,
} from './push-down';
import { type ComposeBallot, useRankingComposeBallot } from './ranking-compose-ballot-context';
import { invalidateBlockRankers } from './use-block-rankers';
import {
  type DebateVoteOverlays,
  debateVoteOverlaysQueryKey,
  freshOverlay,
  useDebateVoteOverlays,
  useDebateVoteWriter,
} from './use-debate-downvote';
import { useMyRanking } from './use-my-ranking';
import { useRankingSubmissions } from './use-ranking-submissions';

const BEST_DEBATES_BLOCK_NAME = 'Best debates';

/** Overlay records, plus the server's records in spaces the overlay doesn't cover. */
export function combineRecords(
  overlay: readonly MemberVoteRecord[],
  server: readonly MemberVoteRecord[]
): MemberVoteRecord[] {
  const covered = new Set(overlay.map(record => ID.uuidToHex(record.spaceId)));
  return [...overlay, ...server.filter(record => !covered.has(ID.uuidToHex(record.spaceId)))];
}

export function pushDownStateQueryKey(personalSpaceId: string | null | undefined, debateId: string) {
  return ['push-down-state', personalSpaceId ?? null, ID.uuidToHex(debateId)] as const;
}

/**
 * The ballot publish a "Rank it" was given, kept so Retry can re-run it. Module scope because it
 * is a function, and one debate has one at a time.
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
  /**
   * The ballot Push it down edits. Defaults to the ranking screen's draft
   * (`RankingComposeBallotContext`) when there is one, else the member's published ballot.
   */
  ballot?: ComposeBallot | null;
};

export type UsePushDownResult = {
  /**
   * False until the block exists, the member has a personal space, the debate's own space is known
   * and the member's current vote on it has loaded. Push it down and Rank it wait for this.
   */
  enabled: boolean;
  /** The member's current vote on the debate has loaded (or was just written here). */
  isVoteKnown: boolean;
  /** The member holds a downvote on the debate, in any space (gaia counts every one). */
  isPushedDown: boolean;
  /** The spaces those downvotes were cast in. */
  downvotedSpaceIds: string[];
  /** The debate is on the ballot being edited, or the published one. With `isPushedDown`: a step to finish. */
  isInBallot: boolean;
  /** Where a new downvote goes: the debate's own space, never the member's or the Debates space. */
  debateSpaceId: string | null;
  state: PushDownState;
  /** Push it down: downvote first, then, once that lands, take it off the ballot if it's there. */
  pushDown: () => Promise<PushDownRunResult>;
  /** Undo in the pushed-down list: clears every downvote the member holds on it. Leaves the ballot alone. */
  undo: () => Promise<PushDownRunResult>;
  /**
   * Rank it: runs `publish` (the caller's ballot publish, resolving true once published) and then,
   * only once it has, clears the member's downvotes on the debate.
   */
  rank: (publish: () => Promise<boolean>) => Promise<PushDownRunResult>;
  /** Re-runs what failed: only the clears when a Rank it already published, else the whole action. */
  retry: () => Promise<PushDownRunResult>;
};

const DISABLED: PushDownRunResult = {
  ok: false,
  step: 'vote',
  partly: false,
  message: 'Down rank isn’t available yet.',
};
const BUSY: PushDownRunResult = { ok: false, step: 'vote', partly: false, message: 'Already working on it.' };
const CHECK_FAILED: PushDownRunResult = { ok: false, step: 'vote', partly: false, message: VOTE_CHECK_FAILED_COPY };

/**
 * Push a debate down on the Best debates ranking screen (GEO-3679), from a team or To rank row's
 * ↓ button: `pushDown`, whose toast offers Undo. `rank` wraps a
 * ballot publish that should also clear the member's downvotes.
 *
 * Every action re-reads the member's votes on the debate first (this session's unindexed writes,
 * else a fresh server read), so it never acts on a stale answer. State is shared per (member,
 * debate) through the query cache, so every entry point and the pushed-down list show the same progress.
 * Needs a `DataBlockProvider` around it, as the published-ballot write (`useRankingSubmissions`)
 * does.
 */
export function usePushDown(debateId: string, options: UsePushDownOptions = {}): UsePushDownResult {
  const blockId = options.blockId === undefined ? BEST_DEBATES_BLOCK_ID : options.blockId;
  const isBlockSet = Boolean(blockId);
  const queryClient = useQueryClient();
  const setToast = useSetToast();
  const { personalSpaceId, isRegistered } = usePersonalSpaceId();
  const composeBallot = useRankingComposeBallot();
  const editBallot = options.ballot === undefined ? composeBallot : options.ballot;

  const { entity: debateEntity } = useQueryEntity({
    id: debateId,
    enabled: isBlockSet && !options.debateSpaceId,
  });
  const debateSpaceId = options.debateSpaceId ?? debateOwnSpaceId(debateEntity, personalSpaceId);

  const { myRankEntity, orderedEntityIds: publishedIds } = useMyRanking(blockId ?? '');
  const { saveMySubmission } = useRankingSubmissions(blockId ?? '', DEBATES_SPACE_ID, BEST_DEBATES_BLOCK_NAME);
  const sendVote = useDebateVoteWriter();

  const canRead = isBlockSet && Boolean(personalSpaceId) && isRegistered;
  const votesKey = React.useMemo(
    () => memberDebateVotesQueryKey(personalSpaceId, debateId),
    [debateId, personalSpaceId]
  );
  const votesQueryFn = React.useCallback(
    // Only votes since the push-down launch count; before it, nothing does, so only this
    // session's own writes (the overlay) can show the debate pushed down.
    async ({ signal }: { signal?: AbortSignal }) =>
      BEST_DEBATES_PUSHDOWN_SINCE == null
        ? []
        : fetchMemberDebateVotes(personalSpaceId!, debateId, { since: BEST_DEBATES_PUSHDOWN_SINCE, signal }),
    [debateId, personalSpaceId]
  );
  const { data: serverRecords } = useQuery({
    queryKey: votesKey,
    queryFn: votesQueryFn,
    enabled: canRead,
    staleTime: 30_000,
  });
  const overlay = freshOverlay(useDebateVoteOverlays(), debateId);
  const records = overlay?.records ?? (canRead ? serverRecords : undefined) ?? null;
  const spaces = React.useMemo(() => (records ? downvotedSpaceIds(records) : []), [records]);

  const isVoteKnown = records !== null;
  const isPushedDown = spaces.length > 0;
  const isInBallot = ballotHolds(editBallot?.orderedIds ?? [], debateId) || ballotHolds(publishedIds, debateId);
  const enabled = canRead && Boolean(debateSpaceId) && isVoteKnown;

  const stateKey = React.useMemo(() => pushDownStateQueryKey(personalSpaceId, debateId), [debateId, personalSpaceId]);
  const { data: state = IDLE_PUSH_DOWN_STATE } = useQuery<PushDownState>({
    queryKey: stateKey,
    queryFn: () => IDLE_PUSH_DOWN_STATE,
    // Seeded rather than fetched: a mount-time fetch resolving after a write would overwrite it.
    initialData: IDLE_PUSH_DOWN_STATE,
    staleTime: Infinity,
    gcTime: Infinity,
  });

  // The writes below run across several renders; they read the newest values, not the ones
  // captured when the press happened.
  const latest = React.useRef({ publishedIds, myRankEntity, editBallot, debateSpaceId, canRead });
  latest.current = { publishedIds, myRankEntity, editBallot, debateSpaceId, canRead };

  const setState = React.useCallback(
    (next: PushDownState) => queryClient.setQueryData<PushDownState>(stateKey, next),
    [queryClient, stateKey]
  );
  const isWorking = React.useCallback(
    () => queryClient.getQueryData<PushDownState>(stateKey)?.status === 'working',
    [queryClient, stateKey]
  );

  /**
   * The member's votes on the debate, read fresh from the server for every action (never the
   * render-time answer), with this session's unindexed writes laid over it: the overlay wins in
   * the spaces it covers, and a space the server still shows downvoted stays in, so a clear reaches
   * it (unvote is idempotent). Null when neither can be had.
   */
  const readRecords = React.useCallback(async (): Promise<MemberVoteRecord[] | null> => {
    const overlay = freshOverlay(
      queryClient.getQueryData<DebateVoteOverlays>(debateVoteOverlaysQueryKey(personalSpaceId)),
      debateId
    );
    let server: MemberVoteRecord[] | null = null;
    try {
      server = await queryClient.fetchQuery({ queryKey: votesKey, queryFn: votesQueryFn, staleTime: 0 });
    } catch {
      server = null;
    }
    if (!overlay) return server;
    if (!server) return overlay.records;
    return combineRecords(overlay.records, server);
  }, [debateId, personalSpaceId, queryClient, votesKey, votesQueryFn]);

  /** One clear per space holding a downvote, one after another. */
  const clearSteps = React.useCallback(
    (current: { records: MemberVoteRecord[] }): PushDownStepRun[] =>
      downvotedSpaceIds(current.records).map(spaceId => ({
        step: 'vote' as const,
        run: async (): Promise<StepResult> => {
          const result = await sendVote({
            debateId,
            spaceId,
            direction: 'clear',
            analyticsAction: 'undo_push_down',
            records: current.records,
          });
          if (result.ok) current.records = result.records;
          return result;
        },
      })),
    [debateId, sendVote]
  );

  /** The draft (order and grades) a Push it down just edited, so its toast's Undo can put it back. */
  const draftBeforePush = React.useRef<{ ids: string[]; grades?: ComposeBallot['grades'] } | null>(null);
  /** The newest `undo`, for the toast's Undo button (built before `undo` is). */
  const undoRef = React.useRef<(() => Promise<PushDownRunResult>) | null>(null);

  const removeFromBallot = React.useCallback(async (): Promise<StepResult> => {
    const { publishedIds: published, myRankEntity: rankEntity, editBallot: draft } = latest.current;

    if (draft) {
      // On the ranking screen: edit the draft and publish it, so nothing unpublished is lost.
      if (!ballotHolds(draft.orderedIds, debateId) && !ballotHolds(published, debateId)) return { ok: true };
      // Down ranking the only debate just empties the draft (Preston, 12 Nov).
      const remaining = ballotWithout(draft.orderedIds, debateId);
      const before = { ids: [...draft.orderedIds], grades: draft.grades };
      if (!(await draft.publish(remaining))) return { ok: false, message: PUSH_DOWN_BALLOT_FAILED_COPY };
      draftBeforePush.current = before;
      return { ok: true };
    }

    if (!ballotHolds(published, debateId)) return { ok: true };
    // The only debate down ranked: the edit clears the ranking (an empty ballot publishes).
    const remaining = ballotWithout(published, debateId);

    // Every other vote is re-sent, so each keeps the space it was ranked in.
    const voteSpaces =
      rankEntity && personalSpaceId
        ? ballotVoteSpaceIds(rankEntity.relations ?? [], rankEntity.id, personalSpaceId)
        : new Map<string, string>();
    const unknown = remaining.filter(id => !voteSpaces.has(ID.uuidToHex(id)));
    if (unknown.length > 0) {
      const entities = await Effect.runPromise(getBatchEntities(unknown));
      for (const entity of entities) {
        const own = debateOwnSpaceId(entity, personalSpaceId);
        if (own) voteSpaces.set(ID.uuidToHex(entity.id), own);
      }
    }
    const slots = remaining.map(id => ({ id, name: null, spaceId: voteSpaces.get(ID.uuidToHex(id)) }));
    if (slots.some(slot => !slot.spaceId)) return { ok: false, message: PUSH_DOWN_BALLOT_FAILED_COPY };

    // Built on the ballot just read (useMyRanking's paged read, GEO-3680), so the publish path merges
    // in anything that moved since rather than dropping it.
    const submission = await saveMySubmission(slots, undefined, { basedOnOrderedIds: published });
    if (!submission) return { ok: false, message: PUSH_DOWN_BALLOT_FAILED_COPY };
    // Ranker counts come from indexed ballots, so refresh them once indexing has settled.
    void submission.indexingSettled.then(() => invalidateBlockRankers(queryClient, blockId!, DEBATES_SPACE_ID));
    return { ok: true };
  }, [blockId, debateId, personalSpaceId, queryClient, saveMySubmission]);

  const finish = React.useCallback(
    (action: PushDownAction, result: PushDownRunResult): PushDownRunResult => {
      if (!result.ok) {
        setState({ status: 'failed', action, step: result.step, partly: result.partly, message: result.message });
        setToast(React.createElement('span', null, result.message));
        return result;
      }
      setState({ status: 'done', action });
      if (action === 'rank') pendingRankPublishes.delete(stateKey.join(':'));
      if (action === 'push-down') {
        const noteSeen = readPushDownNoteSeen();
        const previousDraft = draftBeforePush.current;
        draftBeforePush.current = null;
        // Undo takes back both halves: the draft edit (put back as it was) and the downvote.
        const onUndo = () => {
          setToast(null);
          const draft = latest.current.editBallot;
          // With its grades (GEO-3729), so the debate comes back in the tier it was in.
          if (previousDraft && draft) void draft.publish(previousDraft.ids, previousDraft.grades);
          void undoRef.current?.();
        };
        setToast(
          React.createElement(
            'span',
            { className: 'flex items-center gap-3' },
            React.createElement('span', null, pushDownToastCopy({ rankingLive: BEST_DEBATES_RANKING_LIVE, noteSeen })),
            React.createElement(
              'button',
              {
                type: 'button',
                onClick: onUndo,
                className: 'shrink-0 rounded px-2 py-1 text-smallButton text-white underline-offset-2 hover:underline',
              },
              'Undo'
            )
          )
        );
        if (BEST_DEBATES_RANKING_LIVE) markPushDownNoteSeen();
      }
      if (action === 'undo') setToast(React.createElement('span', null, PUSH_DOWN_UNDONE_COPY));
      return result;
    },
    [setState, setToast, stateKey]
  );

  const start = React.useCallback(
    async (
      action: PushDownAction,
      plan: (records: MemberVoteRecord[]) => ReadonlyArray<PushDownStepRun | null>
    ): Promise<PushDownRunResult> => {
      // Only a new downvote needs the debate's own space; clears go wherever the downvotes are.
      if (!latest.current.canRead || (action === 'push-down' && !latest.current.debateSpaceId)) return DISABLED;
      if (isWorking()) return BUSY;
      setState({ status: 'working', action, step: 'vote' });
      const records = await readRecords();
      if (!records) return finish(action, CHECK_FAILED);
      const result = await runInOrder(plan(records), step => setState({ status: 'working', action, step }));
      return finish(action, result);
    },
    [finish, isWorking, readRecords, setState]
  );

  const pushDown = React.useCallback(
    () =>
      start('push-down', initial => {
        draftBeforePush.current = null;
        const current = { records: initial };
        const ownSpace = latest.current.debateSpaceId!;
        const { editBallot: draft, publishedIds: published } = latest.current;
        const onBallot = ballotHolds(draft?.orderedIds ?? [], debateId) || ballotHolds(published, debateId);
        return [
          // Sent even when a downvote already shows: a downvote is idempotent, and a stale answer
          // must never turn Push it down into a ballot edit with no vote behind it.
          {
            step: 'vote',
            run: async () => {
              const result = await sendVote({
                debateId,
                spaceId: ownSpace,
                direction: 'negative',
                analyticsAction: 'push_down',
                records: current.records,
              });
              if (result.ok) current.records = result.records;
              return result;
            },
          },
          onBallot ? { step: 'ballot', run: removeFromBallot } : null,
        ];
      }),
    [debateId, removeFromBallot, sendVote, start]
  );

  const undo = React.useCallback(() => start('undo', initial => clearSteps({ records: initial })), [clearSteps, start]);
  undoRef.current = undo;

  const publishRanking = React.useCallback(async (publish: () => Promise<boolean>): Promise<StepResult> => {
    return (await publish()) ? { ok: true } : { ok: false, message: RANK_BALLOT_FAILED_COPY };
  }, []);

  /**
   * Rank it's second step. Planned only after the publish has landed, from a fresh read: the
   * publish it wraps (the ranking screen's) may have cleared the downvotes itself, and clearing
   * them again would double the unvotes and contradict its toast.
   */
  const clearRemaining = React.useCallback(
    (): PushDownStepRun => ({
      step: 'vote',
      run: async (): Promise<StepResult> => {
        const records = await readRecords();
        if (!records) return { ok: false, message: VOTE_CHECK_FAILED_COPY };
        return runInOrder(clearSteps({ records })).then(result =>
          result.ok ? result : { ok: false, message: result.message }
        );
      },
    }),
    [clearSteps, readRecords]
  );

  const rank = React.useCallback(
    (publish: () => Promise<boolean>) => {
      pendingRankPublishes.set(stateKey.join(':'), publish);
      return start('rank', () => [{ step: 'ballot', run: () => publishRanking(publish) }, clearRemaining()]);
    },
    [clearRemaining, publishRanking, start, stateKey]
  );

  const retry = React.useCallback(async (): Promise<PushDownRunResult> => {
    const current = queryClient.getQueryData<PushDownState>(stateKey);
    if (!current || current.status !== 'failed') return { ok: true };
    // The downvote already landed: only the ballot edit is left.
    if (current.action === 'push-down' && current.partly) {
      return start('push-down', () => [{ step: 'ballot', run: removeFromBallot }]);
    }
    if (current.action === 'push-down') return pushDown();
    if (current.action === 'undo') return undo();
    // Rank it already published: only the clears are left.
    if (current.partly) return start('rank', () => [clearRemaining()]);
    const publish = pendingRankPublishes.get(stateKey.join(':'));
    return publish ? rank(publish) : { ok: true };
  }, [clearRemaining, pushDown, queryClient, rank, removeFromBallot, start, stateKey, undo]);

  return {
    enabled,
    isVoteKnown,
    isPushedDown,
    downvotedSpaceIds: spaces,
    isInBallot,
    debateSpaceId,
    state,
    pushDown,
    undo,
    rank,
    retry,
  };
}
