'use client';

import * as React from 'react';

import { useActionContext } from '~/core/action-context-provider';
import { recordAction } from '~/core/analytics-operations';
import {
  type PlacementChoice,
  type PlacementSearch,
  choosePlacement,
  indexOfEntity,
  insertAt,
  nudge,
  placementComparisonIndex,
  startPlacement,
} from '~/core/blocks/ranking/ranking-placement';
import { normId } from '~/core/utils/norm-id';

import type { PushDownSlot } from './push-down-slot';
import { RankingCompareDialog } from './ranking-compare-dialog';
import { RankingPlacedDialog } from './ranking-placed-dialog';

/** Where the ranker started placing a debate. Only To rank offers "Rank the next one". */
export type PlacementOrigin = 'team' | 'to_rank' | 'mine';

type FlowState =
  | {
      phase: 'compare';
      entityId: string;
      origin: PlacementOrigin;
      /** The list the debate is being placed into: the ranker's list without it. */
      list: string[];
      search: PlacementSearch;
      /** The comparisons answered so far, oldest first: Back rewinds to the last of them. */
      history: PlacementSearch[];
      withOtherChanges: boolean;
    }
  | {
      phase: 'placed';
      entityId: string;
      origin: PlacementOrigin;
      /** Where it was placed, to put it back if the draft lost it before Done (see `publishPlaced`). */
      placedIndex: number;
      withOtherChanges: boolean;
      /** The last Done or Rank the next one didn't go out. */
      publishFailed?: boolean;
      /** Opened by Re-order on a debate already in the ranking (GEO-3729). */
      reorder?: boolean;
    };

export type UseBestDebatesPlacementArgs = {
  blockId: string;
  /** The ranker's list as drafted, best first. */
  orderedIds: string[];
  /** `movedId`: the debate this change moved, when known, so its grade follows it (GEO-3729). */
  setOrderedIds: (ids: string[], movedId?: string) => void;
  /** True when the draft already differs from the published ballot. */
  hasUnpublishedChanges: boolean;
  nameOf: (entityId: string) => string;
  /** To rank as it stands (it follows `orderedIds`, so a placed debate has already left it). */
  toRankIds: string[];
  /** Publishes `ids` as one edit; resolves true when it went out. */
  publish: (ids: string[]) => Promise<boolean>;
  isSaving: boolean;
  /** GEO-3679's Push it down. Without it, Rank goes straight to the comparison. */
  pushDown?: PushDownSlot;
  /**
   * Whether Done and Rank the next one publish the ballot. Off on the ranking screen (Preston,
   * 12 Nov): placing only changes the draft, and the screen's Publish sends every change at once.
   * On for a future single-debate entry point (the Explore card's Rank), where there is no screen
   * to publish from.
   */
  publishOnDone?: boolean;
  /**
   * A Re-order's Placed step ended (GEO-3729): `done` once its Done kept or published the move,
   * `closed` when it was closed without Done.
   */
  onReorderEnd?: (entityId: string, outcome: 'done' | 'closed') => void;
};

/**
 * Placing one debate on the Best debates ranking (GEO-3678): straight into the "which was
 * better?" comparisons, then "Placed #N of M". Push it down lives only on team and To rank rows
 * (`requestPushDown`).
 *
 * Nothing touches the ranker's list until the debate is placed, so leaving the comparison part way
 * changes nothing. With `publishOnDone` off (the ranking screen) Done only keeps the placement in
 * the draft for the screen's Publish; on, Done and Rank the next one publish the whole list as one
 * edit, with no vote.
 */
export function useBestDebatesPlacement({
  blockId,
  orderedIds,
  setOrderedIds,
  hasUnpublishedChanges,
  nameOf,
  toRankIds,
  publish,
  isSaving,
  pushDown,
  publishOnDone = false,
  onReorderEnd,
}: UseBestDebatesPlacementArgs) {
  const [flow, setFlow] = React.useState<FlowState | null>(null);
  const getContext = useActionContext('ranking_composer', 'ranking', blockId);

  // Done and Rank the next one publish whatever the list is when pressed, nudges included.
  const orderedIdsRef = React.useRef(orderedIds);
  orderedIdsRef.current = orderedIds;
  // Read when a placement starts, which can be right after a publish, before this hook re-renders.
  const hasUnpublishedChangesRef = React.useRef(hasUnpublishedChanges);
  hasUnpublishedChangesRef.current = hasUnpublishedChanges;

  const record = React.useCallback(
    (
      action: 'ranking_place_started' | 'ranking_compare_step' | 'ranking_placed' | 'ranking_place_cancelled',
      entityId: string,
      scope: { item_position?: number; variant?: string },
      properties: Record<string, unknown>
    ) => {
      try {
        recordAction(action, getContext({ target_type: 'entity', target_id: entityId, ...scope }), {
          ranking_id: blockId,
          entity_id: entityId,
          ...properties,
        });
      } catch {
        /* Optional telemetry. */
      }
    },
    [blockId, getContext]
  );

  const beginCompare = React.useCallback(
    (entityId: string, origin: PlacementOrigin, justPublished = false) => {
      const list = orderedIdsRef.current.filter(id => normId(id) !== normId(entityId));
      // Right after Rank the next one's publish the draft is clean, whatever the last render said.
      const withOtherChanges = !justPublished && hasUnpublishedChangesRef.current;
      const start = startPlacement(list.length);
      if (start.done) {
        setOrderedIds(insertAt(list, entityId, start.index), entityId);
        record('ranking_placed', entityId, { item_position: start.index + 1, variant: origin }, { item_count: 1 });
        setFlow({ phase: 'placed', entityId, origin, placedIndex: start.index, withOtherChanges });
        return;
      }
      setFlow({ phase: 'compare', entityId, origin, list, search: start.search, history: [], withOtherChanges });
    },
    [record, setOrderedIds]
  );

  const start = React.useCallback(
    (entityId: string, origin: PlacementOrigin, justPublished = false) => {
      record(
        'ranking_place_started',
        entityId,
        { variant: origin },
        {
          item_count: orderedIdsRef.current.length,
        }
      );
      // Straight to the first comparison (Preston, 12 Nov: no Rank it / Push it down step).
      beginCompare(entityId, origin, justPublished);
    },
    [beginCompare, record]
  );

  /**
   * Re-order (GEO-3729): the Placed step for a debate already in the ranking, at its place, from the
   * watch popup's grade row. Its arrows move it as they do after a placement (across a tier line it
   * takes that tier), and Done keeps or publishes it as a placement's Done does.
   */
  const reorder = React.useCallback((entityId: string) => {
    const index = indexOfEntity(orderedIdsRef.current, entityId);
    if (index < 0) return;
    setFlow({
      phase: 'placed',
      entityId,
      origin: 'mine',
      placedIndex: index,
      withOtherChanges: hasUnpublishedChangesRef.current,
      reorder: true,
    });
  }, []);

  /**
   * Push it down, from the compare header or a team row's ↓: the same downvote and draft edit the
   * choice used to start. It waits until the ranker's vote on the debate has been read.
   */
  const [pushTarget, setPushTarget] = React.useState<string | null>(null);
  const requestPushDown = React.useCallback(
    (entityId: string) => {
      if (!pushDown) return;
      setFlow(current => (current && normId(current.entityId) === normId(entityId) ? null : current));
      setPushTarget(entityId);
    },
    [pushDown]
  );
  const pushTargetReady = pushTarget ? (pushDown?.isReady ? pushDown.isReady(pushTarget) : true) : false;
  React.useEffect(() => {
    if (!pushTarget || !pushTargetReady || !pushDown) return;
    pushDown.onSelect(pushTarget);
    setPushTarget(null);
  }, [pushDown, pushTarget, pushTargetReady]);

  const cancel = React.useCallback(() => {
    if (flow && flow.phase !== 'placed') {
      record(
        'ranking_place_cancelled',
        flow.entityId,
        { variant: flow.origin, item_position: flow.phase === 'compare' ? flow.search.step : 0 },
        {}
      );
    }
    setFlow(null);
  }, [flow, record]);

  const choose = React.useCallback(
    (choice: PlacementChoice) => {
      if (!flow || flow.phase !== 'compare') return;
      record(
        'ranking_compare_step',
        flow.entityId,
        { item_position: flow.search.step, variant: flow.origin },
        { response_kind: choice }
      );
      const result = choosePlacement(flow.search, choice);
      if (!result.done) {
        setFlow({ ...flow, search: result.search, history: [...flow.history, flow.search] });
        return;
      }
      const next = insertAt(flow.list, flow.entityId, result.index);
      setOrderedIds(next, flow.entityId);
      record(
        'ranking_placed',
        flow.entityId,
        { item_position: result.index + 1, variant: flow.origin },
        { item_count: next.length }
      );
      setFlow({
        phase: 'placed',
        entityId: flow.entityId,
        origin: flow.origin,
        placedIndex: result.index,
        withOtherChanges: flow.withOtherChanges,
      });
    },
    [flow, record, setOrderedIds]
  );

  /** Back to the previous comparison, its answer undone (Preston, 12 Nov). Nothing on step 1. */
  const back = React.useCallback(() => {
    setFlow(current => {
      if (current?.phase !== 'compare' || current.history.length === 0) return current;
      const history = current.history.slice(0, -1);
      return { ...current, search: current.history[current.history.length - 1]!, history };
    });
  }, []);

  /**
   * Publishes the list as it stands, through GEO-3679's `rank` (publish, then clear a downvote) when it is wired in. The
   * screen merges a refetched ballot into the draft rather than replacing it, so the placed debate
   * should always still be there; if it isn't, it goes back where it was placed before publishing.
   */
  const publishPlaced = React.useCallback(
    (entityId: string, placedIndex: number) => {
      let ids = orderedIdsRef.current;
      if (indexOfEntity(ids, entityId) < 0) {
        ids = insertAt(ids, entityId, placedIndex);
        setOrderedIds(ids);
      }
      const run = () => publish(ids);
      return pushDown?.rank ? pushDown.rank(entityId, run) : run();
    },
    [publish, pushDown, setOrderedIds]
  );

  const markPublishFailed = React.useCallback(() => {
    setFlow(current => (current?.phase === 'placed' ? { ...current, publishFailed: true } : current));
  }, []);

  /** Without publishing: makes sure the placed debate is still in the draft where it was placed. */
  const keepPlaced = React.useCallback(
    (entityId: string, placedIndex: number) => {
      const ids = orderedIdsRef.current;
      if (indexOfEntity(ids, entityId) < 0) setOrderedIds(insertAt(ids, entityId, placedIndex));
    },
    [setOrderedIds]
  );

  const done = React.useCallback(
    async (entityId: string, placedIndex: number, reorder = false) => {
      if (!publishOnDone) {
        keepPlaced(entityId, placedIndex);
        setFlow(null);
        if (reorder) onReorderEnd?.(entityId, 'done');
        return;
      }
      if (await publishPlaced(entityId, placedIndex)) {
        setFlow(null);
        if (reorder) onReorderEnd?.(entityId, 'done');
      } else markPublishFailed();
    },
    [keepPlaced, markPublishFailed, onReorderEnd, publishOnDone, publishPlaced]
  );

  const rankNext = React.useCallback(
    async (entityId: string, placedIndex: number, nextId: string) => {
      if (!publishOnDone) {
        keepPlaced(entityId, placedIndex);
        start(nextId, 'to_rank');
        return;
      }
      if (!(await publishPlaced(entityId, placedIndex))) {
        markPublishFailed();
        return;
      }
      start(nextId, 'to_rank', true);
    },
    [keepPlaced, markPublishFailed, publishOnDone, publishPlaced, start]
  );

  let dialogs: React.ReactNode = null;
  if (flow?.phase === 'compare') {
    const mid = placementComparisonIndex(flow.search);
    const existingId = flow.list[mid];
    dialogs = (
      <RankingCompareDialog
        newDebate={{ entityId: flow.entityId, name: nameOf(flow.entityId) }}
        existingDebate={{ entityId: existingId, name: nameOf(existingId) }}
        existingRank={mid + 1}
        search={flow.search}
        onChoose={choose}
        onBack={flow.history.length > 0 ? back : undefined}
        onClose={cancel}
      />
    );
  } else if (flow?.phase === 'placed') {
    const placedId = flow.entityId;
    const remaining = toRankIds.filter(id => normId(id) !== normId(placedId));
    dialogs = (
      <RankingPlacedDialog
        entityId={placedId}
        orderedIds={orderedIds}
        nameOf={nameOf}
        withOtherChanges={flow.withOtherChanges}
        publishesOnDone={publishOnDone}
        publishFailed={Boolean(flow.publishFailed)}
        isSaving={isSaving}
        onNudge={direction => setOrderedIds(nudge(orderedIdsRef.current, placedId, direction), placedId)}
        onDone={() => void done(placedId, flow.placedIndex, flow.reorder)}
        onClose={() => {
          setFlow(null);
          if (flow.reorder) onReorderEnd?.(placedId, 'closed');
        }}
        next={
          flow.origin === 'to_rank' && remaining.length > 0
            ? {
                remaining: remaining.length,
                onRankNext: () => void rankNext(placedId, flow.placedIndex, remaining[0]),
              }
            : undefined
        }
      />
    );
  }

  return {
    start,
    reorder,
    dialogs,
    isPlacing: flow !== null,
    /** The debate the comparison or confirmation is about, or one being pushed down (push-down binds to it). */
    activeEntityId: flow?.entityId ?? pushTarget ?? null,
    /** Push a debate down without placing it (a team row's ↓). */
    requestPushDown,
  };
}
