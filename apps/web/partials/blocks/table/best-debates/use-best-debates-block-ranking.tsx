'use client';

import * as React from 'react';

import type { ComposeBallot } from '~/core/blocks/ranking/ranking-compose-ballot-context';
import {
  type BallotGrades,
  type Grade,
  type GradedBallot,
  gradeInto,
  gradeOf,
  hasAnyGrade,
  placeAsIn,
  removeEntry,
  restoreRemoved,
} from '~/core/blocks/ranking/ranking-grades';
import { rankingPublishKey, sameBallot, setUnsavedRankingDraft } from '~/core/blocks/ranking/ranking-publish-queue';
import type { RankingSubmissionSlot } from '~/core/blocks/ranking/ranking-submission-types';
import {
  useBestDebatesBallotPublisher,
  useMyPushedDownDebates,
} from '~/core/blocks/ranking/use-my-pushed-down-debates';
import { useRankingEntryEntities } from '~/core/blocks/ranking/use-ranking-entry-entities';
import { useRankingSubmissions } from '~/core/blocks/ranking/use-ranking-submissions';
import { usePersonalSpaceId } from '~/core/hooks/use-personal-space-id';
import { normId } from '~/core/utils/norm-id';

import { gradesForOrder, rankingComposeSeed, useRankingComposeDraft } from '../use-ranking-compose-draft';
import {
  type BestDebatesGrading,
  type GradeMethod,
  gradeChanges,
  reorderGradeChanges,
  useRecordGrade,
} from './best-debate-grading';
import { useBestDebatesCompose } from './use-best-debates-compose';
import { useBestDebatesPushDownSlot } from './use-best-debates-push-down-slot';
import { useRemovedToast } from './use-removed-toast';

const NO_IDS: readonly string[] = [];

/**
 * Ranking from the space page's Best debates block (Preston, 12 Nov): Rank on a row opens the
 * compare flow over the page; the popup grades and re-orders; Down rank is the ranking screen's
 * (the downvote at once, and a toast with Undo). Every ballot edit from here joins one batched
 * publish (`useBlockGrading`), so a grade and its Re-order, or a run of grades, go out together.
 *
 * Off (every read idle, nothing drawn) unless the viewer may rank: the flag and Debates membership.
 */
export function useBestDebatesBlockRanking({
  enabled,
  blockId,
  spaceId,
  isMobile,
}: {
  enabled: boolean;
  blockId: string;
  spaceId: string;
  isMobile: boolean;
}) {
  const { personalSpaceId } = usePersonalSpaceId();
  const { myLastSubmission, myGrades, saveMySubmission, isSaving, isLoading, ballotReadError, unsavedDraft } =
    useRankingSubmissions(blockId, spaceId, 'Best debates');
  const { orderedIds, grades, setOrderedIds, setDraft, getBasedOnOrderedIds, getBasedOnGrades, markPublished } =
    useRankingComposeDraft(rankingComposeSeed(unsavedDraft, myLastSubmission?.orderedEntityIds, myGrades));

  const { debates: pushedDown } = useMyPushedDownDebates({ blockId: enabled ? blockId : null });
  const pushedDownEntityIds = React.useMemo(() => pushedDown.map(debate => debate.entityId), [pushedDown]);
  const pushDown = useBestDebatesPushDownSlot({ blockId: enabled ? blockId : null, pushedDownEntityIds });
  const { publish: publishClearingDownvotes, isPublishing } = useBestDebatesBallotPublisher();

  // Built on the published ballot as it stands when the batch sends it.
  const save = async (slots: RankingSubmissionSlot[]) => {
    const base = { ids: getBasedOnOrderedIds(), grades: getBasedOnGrades() };
    const result = await publishClearingDownvotes(
      slots.map(slot => slot.id),
      () => saveMySubmission(slots, undefined, { basedOnOrderedIds: base.ids, basedOnGrades: base.grades })
    );
    return result?.published ?? null;
  };

  // The compare view names the debate it shows from your ranking; the block's rows don't hold them.
  const { entries } = useRankingEntryEntities(spaceId, enabled ? orderedIds : []);
  const nameById = React.useMemo(() => new Map(entries.map(entry => [normId(entry.entityId), entry.name])), [entries]);

  // The batch is built after the compose hook (it publishes through it), and the compose hook's
  // placements publish through the batch: a ref joins them.
  const batchRef = React.useRef<BlockBatch | null>(null);
  const draftNow = React.useRef<GradedBallot>({ ids: orderedIds, grades });
  draftNow.current = { ids: orderedIds, grades };
  /** A placement, as it stands in the draft, into the batch. */
  const commitPlacement = (entityId: string, ids: string[]) => {
    const snapshot = { ids: [...ids], grades: gradesForOrder(draftNow.current.ids, draftNow.current.grades, ids) };
    return (
      batchRef.current?.commit([entityId], draft => placeAsIn(draft, snapshot, entityId)) ?? Promise.resolve(false)
    );
  };

  const compose = useBestDebatesCompose({
    enabled,
    blockId,
    blockSpaceId: spaceId,
    isMobile,
    orderedIds,
    grades,
    setOrderedIds,
    hasUnpublishedChanges: false,
    nameOf: entityId => nameById.get(normId(entityId)) ?? null,
    personalSpaceId,
    saveMySubmission: save,
    isSaving: isSaving || isPublishing,
    pushDown: pushDown.slot,
    onPublished: (published, sentIds, sentGrades) =>
      markPublished(published.orderedEntityIds, sentIds, published.grades, sentGrades),
    // Nothing else on this page can save the placement, so Done publishes it (through the batch).
    publishOnDone: true,
    // A placement's Done, and a placement closed without Done, join the batch.
    publishThrough: (ids, entityId) => (entityId ? commitPlacement(entityId, ids) : Promise.resolve(false)),
    onPlacedClose: entityId => void commitPlacement(entityId, draftNow.current.ids),
    // Re-order (and the Placed step a popup grade opens): however it ends, its move joins the batch.
    onReorderEnd: ({ entityId, before, after }) => batchRef.current?.endPlaced(entityId, before, after),
  });

  const myRankById = React.useMemo(() => new Map(orderedIds.map((id, i) => [normId(id), i + 1])), [orderedIds]);
  // Until the ranker's own ballot is read whole, a placement would compare against the wrong list.
  const ready = enabled && !isLoading && !ballotReadError;

  const grading = useBlockGrading({
    blockId,
    ready,
    orderedIds,
    grades,
    setDraft,
    getBasedOnOrderedIds,
    getBasedOnGrades,
    publish: compose.publishNow,
    draftKey: personalSpaceId ? rankingPublishKey(personalSpaceId, blockId) : null,
    downRank: compose.requestPushDown,
    reorder: compose.reorder,
    placeAfterGrade: true,
    nameOf: entityId => nameById.get(normId(entityId)) ?? null,
  });
  batchRef.current = grading;

  // Down rank's ballot edit (and its Undo) joins the batch too, through the ballot context
  // `usePushDown` edits when there is one.
  const commitBallot = grading.commitBallot;
  const ballot = React.useMemo<ComposeBallot>(
    () => ({ orderedIds, grades, publish: (ids, nextGrades) => commitBallot(ids, nextGrades) }),
    [commitBallot, grades, orderedIds]
  );

  return {
    enabled,
    ready,
    myRankOf: (entityId: string) => myRankById.get(normId(entityId)) ?? null,
    rank: (entityId: string) => compose.placeFromTeam(entityId),
    downRank: (entityId: string) => compose.requestPushDown(entityId),
    /** The watch popup's grade row (GEO-3729): grades join the block's batched publish. */
    grading: enabled ? grading : null,
    /** The ballot Down rank edits on the block (`RankingComposeBallotContext`). */
    ballot: enabled ? ballot : null,
    pushedDownEntityIds: enabled ? pushedDownEntityIds : NO_IDS,
    /** "You've ranked N of M debates from the last 7 days", in To rank's terms. */
    coverage: enabled && compose.toRankCoverage ? compose.toRankCoverage : null,
    dialogs: enabled ? (
      <>
        {compose.dialogs}
        {pushDown.binding(compose.activeEntityId)}
      </>
    ) : null,
  };
}

/** A change to the block's ballot, replayed onto whatever is published when it goes out. */
type BallotChange = (draft: GradedBallot) => GradedBallot;
type QueuedChange = { entityIds: string[]; change: BallotChange };

/**
 * The block's batched publish (GEO-3729, Preston 16 Nov: "grades, re-orders, etc. collected as much
 * as possible and published all at once"). Every ballot edit made from the block (a popup or row
 * grade, a Re-order, a placement, Remove, Down rank's ballot edit) shows at once and joins one
 * batch:
 *
 * - With nothing out, a change publishes straight away.
 * - Changes made while a publish is out wait, and all of them go in one follow-up publish of the
 *   whole ballot: never one publish per change.
 * - While a Placed step is open (a popup grade opens one, so the grade and its fine-tuning go out
 *   together; so does Re-order) nothing publishes. Its Done or close sends it with everything
 *   waiting.
 *
 * Each publish replays the unsent changes onto what is published at that moment (which the last
 * publish may have merged with another device's changes), never sends a stale copy. A failed
 * publish keeps every change on the ballot and in the batch; "Try again" (or the next change) sends
 * them.
 */
export function useBlockGrading({
  blockId,
  ready,
  orderedIds,
  grades,
  setDraft,
  getBasedOnOrderedIds,
  getBasedOnGrades,
  publish,
  draftKey = null,
  downRank,
  reorder = () => false,
  placeAfterGrade = false,
  nameOf = () => null,
}: {
  blockId: string;
  ready: boolean;
  orderedIds: string[];
  grades: BallotGrades;
  setDraft: (ids: string[], grades: BallotGrades) => void;
  getBasedOnOrderedIds: () => string[];
  getBasedOnGrades: () => BallotGrades;
  /** Publishes the whole ballot as given; resolves true once it went out. */
  publish: (ids: string[], grades?: BallotGrades) => Promise<boolean>;
  /**
   * Where edits that never went out are handed back (`setUnsavedRankingDraft`) when the block goes
   * away with them, so the ranking screen (or the block, when it comes back) starts from them.
   */
  draftKey?: string | null;
  downRank: (entityId: string) => void;
  /**
   * Opens the Placed step for a debate in the ranking, at its place; false when it couldn't. Its
   * end comes back through `endPlaced`.
   */
  reorder?: (entityId: string) => boolean | void;
  /** A popup grade opens the Placed step for the debate, so its place can be fine-tuned first. */
  placeAfterGrade?: boolean;
  /** A debate's name, for Remove's toast. */
  nameOf?: (entityId: string) => string | null;
}): BlockBatch {
  const recordGrade = useRecordGrade(blockId);
  // The draft as of the last change (state lags a render behind).
  const latest = React.useRef({ ids: orderedIds, grades });
  latest.current = { ids: orderedIds, grades };
  const queued = React.useRef<QueuedChange[]>([]);
  /** Callers waiting on the publish that carries their change (a placement's Done). */
  const waiters = React.useRef<Array<(ok: boolean) => void>>([]);
  const inFlight = React.useRef(false);
  /** A Placed step is open: nothing publishes until it ends. */
  const holding = React.useRef(false);
  /** How each debate's unsent grade was given, for its published event. */
  const methods = React.useRef(new Map<string, GradeMethod>());
  /** Debates with a change not published yet (queued, held, out, or failed). */
  const [pending, setPending] = React.useState<ReadonlySet<string>>(new Set());
  const [failed, setFailed] = React.useState(false);

  const syncPending = React.useCallback(() => {
    setPending(new Set(queued.current.flatMap(item => item.entityIds.map(normId))));
  }, []);

  const flush = React.useCallback(async () => {
    if (inFlight.current || holding.current) return;
    inFlight.current = true;
    try {
      while (queued.current.length > 0 && !holding.current) {
        // Every change not yet published, replayed onto what is published now.
        const before = { ids: getBasedOnOrderedIds(), grades: getBasedOnGrades() };
        const pass = [...queued.current];
        const passWaiters = waiters.current;
        waiters.current = [];
        const passMethods = methods.current;
        methods.current = new Map();
        const sent = pass.reduce((draft, item) => item.change(draft), before);
        setFailed(false);
        // Already published as it would be sent (a change the last publish carried, made again):
        // nothing to send.
        const ok = sameBallot(sent.ids, sent.grades, before.ids, before.grades)
          ? true
          : await publish(sent.ids, sent.grades).catch((error: unknown) => {
              console.error('[useBlockGrading] Publishing the batch failed:', error);
              return false;
            });
        if (!ok) {
          // Nothing is dropped: the ranking keeps every change, and they all go with the next try.
          for (const [key, method] of passMethods) if (!methods.current.has(key)) methods.current.set(key, method);
          setFailed(true);
          for (const resolve of [...passWaiters, ...waiters.current]) resolve(false);
          waiters.current = [];
          break;
        }
        queued.current = queued.current.slice(pass.length);
        syncPending();
        // A grade counts where it was given (a placement, or Down rank's edit, counts as its own
        // action, not as a grade).
        for (const change of gradeChanges(before.ids, before.grades, sent.ids, sent.grades)) {
          const method = passMethods.get(normId(change.entityId));
          if (!method) continue;
          recordGrade(change.entityId, {
            grade: change.grade,
            previousGrade: change.previousGrade,
            method,
            mutationKind: 'published',
          });
        }
        for (const resolve of passWaiters) resolve(true);
      }
    } finally {
      inFlight.current = false;
    }
  }, [getBasedOnGrades, getBasedOnOrderedIds, publish, recordGrade, syncPending]);

  /** Queues a change, shows it at once, and publishes it with whatever else is waiting. */
  const enqueue = React.useCallback(
    (entityIds: string[], change: BallotChange, method?: GradeMethod) => {
      queued.current.push({ entityIds, change });
      latest.current = change(latest.current);
      if (method) for (const entityId of entityIds) methods.current.set(normId(entityId), method);
      setDraft(latest.current.ids, latest.current.grades);
      syncPending();
      void flush();
    },
    [flush, setDraft, syncPending]
  );

  /** `enqueue`, resolving with how the publish that carries the change went. */
  const commit = React.useCallback(
    (entityIds: string[], change: BallotChange) =>
      new Promise<boolean>(resolve => {
        waiters.current.push(resolve);
        enqueue(entityIds, change);
      }),
    [enqueue]
  );

  // The Placed step: a popup grade opens it once the graded debate is in the draft.
  const [placeNext, setPlaceNext] = React.useState<string | null>(null);
  const openPlaced = React.useCallback(
    (entityId: string) => {
      holding.current = true;
      if (reorder(entityId) === false) {
        holding.current = false;
        void flush();
      }
    },
    [flush, reorder]
  );
  React.useEffect(() => {
    if (!placeNext || !orderedIds.some(id => normId(id) === normId(placeNext))) return;
    setPlaceNext(null);
    openPlaced(placeNext);
  }, [openPlaced, orderedIds, placeNext]);

  /**
   * The Placed step ended (Done or close): its move, if any, joins the batch, and the batch goes
   * out. `before` is the draft as the step opened, `after` as it ended.
   */
  const endPlaced = React.useCallback(
    (entityId: string, before: GradedBallot, after: GradedBallot) => {
      holding.current = false;
      const moved = !sameBallot(before.ids, before.grades, after.ids, after.grades);
      if (!moved) {
        void flush();
        return;
      }
      // A grade given in the popup and then moved across a tier line in its Placed step still
      // counts as the popup's: one grade event per debate per publish, the way it was first given.
      const regraded =
        reorderGradeChanges(entityId, before, after).length > 0 && !methods.current.has(normId(entityId));
      const snapshot = { ids: [...after.ids], grades: after.grades };
      enqueue([entityId], draft => placeAsIn(draft, snapshot, entityId), regraded ? 'reorder' : undefined);
    },
    [enqueue, flush]
  );

  /** Sets the ballot to `ids` (Down rank's edit, and its Undo): what left goes, what joined comes back. */
  const commitBallot = React.useCallback(
    (ids: string[], givenGrades?: BallotGrades) => {
      const target = { ids, grades: givenGrades ?? latest.current.grades };
      const now = new Set(latest.current.ids.map(normId));
      const next = new Set(ids.map(normId));
      const removed = latest.current.ids.filter(id => !next.has(normId(id)));
      const added = ids.filter(id => !now.has(normId(id)));
      if (removed.length === 0 && added.length === 0) return Promise.resolve(true);
      return commit([...removed, ...added], draft => {
        let result = removed.reduce((current, id) => removeEntry(current.ids, current.grades, id), draft);
        for (const id of added) result = placeAsIn(result, target, id);
        return result;
      });
    },
    [commit]
  );

  // Leaving the block (a link, Grade your ranking) with edits that never went out hands them back
  // as an unsaved draft: the ranking screen, or the block when it comes back, starts from them.
  const handBack = React.useRef({ draftKey, getBasedOnOrderedIds, getBasedOnGrades });
  handBack.current = { draftKey, getBasedOnOrderedIds, getBasedOnGrades };
  React.useEffect(
    () => () => {
      const { draftKey: key, getBasedOnOrderedIds: baseIds, getBasedOnGrades: baseGrades } = handBack.current;
      if (!key || queued.current.length === 0) return;
      const base = { ids: baseIds(), grades: baseGrades() };
      const unsent = queued.current.reduce((draft, item) => item.change(draft), base);
      if (sameBallot(unsent.ids, unsent.grades, base.ids, base.grades)) return;
      setUnsavedRankingDraft(key, {
        orderedEntityIds: unsent.ids,
        grades: unsent.grades,
        baseOrderedIds: base.ids,
        baseGrades: base.grades,
        overtakenOrderedIds: base.ids,
        overtakenGrades: base.grades,
      });
    },
    []
  );

  // Closing the tab with changes not yet published asks first, as the ranking screen does.
  const unsent = pending.size > 0;
  React.useEffect(() => {
    if (!unsent) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [unsent]);

  // Remove (GEO-3805) publishes at once, and its toast's Undo publishes the debate back the same
  // way: where it was, with its grade, into the ballot as it is when that goes out. Nothing changes
  // when it is back already (graded or placed again since).
  const showRemovedToast = useRemovedToast();
  const remove = (entityId: string) => {
    const before = latest.current;
    enqueue([entityId], draft => removeEntry(draft.ids, draft.grades, entityId), 'popup');
    showRemovedToast(nameOf(entityId), () => enqueue([entityId], draft => restoreRemoved(draft, before, entityId)));
  };

  const placeById = React.useMemo(() => new Map(orderedIds.map((id, i) => [normId(id), i + 1])), [orderedIds]);

  return {
    ready,
    needsTierLines: orderedIds.length > 0 && !hasAnyGrade(orderedIds, grades),
    gradeOf: entityId => (placeById.has(normId(entityId)) ? gradeOf(grades, entityId) : null),
    placeOf: entityId => placeById.get(normId(entityId)) ?? null,
    isSaving: entityId => !failed && pending.has(normId(entityId)),
    publishFailed: entityId => failed && pending.has(normId(entityId)),
    retry: () => void flush(),
    grade: (entityId: string, grade: Grade, method: GradeMethod = 'popup') => {
      const opensPlaced = placeAfterGrade && method === 'popup';
      // Held from the grade itself, so it waits for the Placed step it opens.
      if (opensPlaced) holding.current = true;
      enqueue([entityId], draft => gradeInto(draft.ids, draft.grades, entityId, grade), method);
      if (opensPlaced) setPlaceNext(entityId);
    },
    reorder: (entityId: string) => openPlaced(entityId),
    reorderBusy: false,
    remove,
    // Counted as Down rank's own `push_down` once its downvote lands.
    downRank,
    endPlaced,
    commit,
    commitBallot,
    hasUnsent: unsent,
  };
}

/** The block's grading for the popup and rows, plus the batch the block's other edits join. */
export type BlockBatch = BestDebatesGrading & {
  /** The Placed step ended: see `useBlockGrading`. */
  endPlaced: (entityId: string, before: GradedBallot, after: GradedBallot) => void;
  /** Joins the batch; resolves with how the publish that carries it went. */
  commit: (entityIds: string[], change: (draft: GradedBallot) => GradedBallot) => Promise<boolean>;
  /** Sets the ballot to `ids` through the batch (Down rank's ballot edit and its Undo). */
  commitBallot: (ids: string[], grades?: BallotGrades) => Promise<boolean>;
  /** Some change isn't published yet. */
  hasUnsent: boolean;
};
