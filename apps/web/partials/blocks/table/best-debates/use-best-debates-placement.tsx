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

import { type PushDownSlot, RankChoiceDialog } from './rank-choice-dialog';
import { RankingCompareDialog } from './ranking-compare-dialog';
import { RankingPlacedDialog } from './ranking-placed-dialog';

/** Where the ranker started placing a debate. Only To rank offers "Rank the next one". */
export type PlacementOrigin = 'team' | 'to_rank' | 'mine';

type FlowState =
  | { phase: 'choose'; entityId: string; origin: PlacementOrigin }
  | {
      phase: 'compare';
      entityId: string;
      origin: PlacementOrigin;
      /** The list the debate is being placed into: the ranker's list without it. */
      list: string[];
      search: PlacementSearch;
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
    };

export type UseBestDebatesPlacementArgs = {
  blockId: string;
  /** The ranker's list as drafted, best first. */
  orderedIds: string[];
  setOrderedIds: (ids: string[]) => void;
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
};

/**
 * Placing one debate on the Best debates ranking (GEO-3678): the Rank it / Push it down choice, the
 * "which was better?" comparisons, then "Placed #N of M".
 *
 * Nothing touches the ranker's list until the debate is placed, so leaving the comparison part way
 * changes nothing. Once placed, only Done and Rank the next one publish: the whole list as one edit,
 * with any drags not yet published, and no vote. Closing the confirmation just closes it and leaves
 * the placement as an unpublished change for the screen's Publish button.
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
        setOrderedIds(insertAt(list, entityId, start.index));
        record('ranking_placed', entityId, { item_position: start.index + 1, variant: origin }, { item_count: 1 });
        setFlow({ phase: 'placed', entityId, origin, placedIndex: start.index, withOtherChanges });
        return;
      }
      setFlow({ phase: 'compare', entityId, origin, list, search: start.search, withOtherChanges });
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
      if (pushDown) setFlow({ phase: 'choose', entityId, origin });
      else beginCompare(entityId, origin, justPublished);
    },
    [beginCompare, pushDown, record]
  );

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
        setFlow({ ...flow, search: result.search });
        return;
      }
      const next = insertAt(flow.list, flow.entityId, result.index);
      setOrderedIds(next);
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
    async (entityId: string, placedIndex: number) => {
      if (!publishOnDone) {
        keepPlaced(entityId, placedIndex);
        setFlow(null);
        return;
      }
      if (await publishPlaced(entityId, placedIndex)) setFlow(null);
      else markPublishFailed();
    },
    [keepPlaced, markPublishFailed, publishOnDone, publishPlaced]
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
  if (flow?.phase === 'choose') {
    dialogs = (
      <RankChoiceDialog
        entityId={flow.entityId}
        debateName={nameOf(flow.entityId)}
        alreadyRanked={orderedIds.some(id => normId(id) === normId(flow.entityId))}
        onRankIt={() => beginCompare(flow.entityId, flow.origin)}
        pushDown={pushDown}
        onClose={cancel}
      />
    );
  } else if (flow?.phase === 'compare') {
    const mid = placementComparisonIndex(flow.search);
    const existingId = flow.list[mid];
    dialogs = (
      <RankingCompareDialog
        newDebate={{ entityId: flow.entityId, name: nameOf(flow.entityId) }}
        existingDebate={{ entityId: existingId, name: nameOf(existingId) }}
        existingRank={mid + 1}
        search={flow.search}
        onChoose={choose}
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
        onNudge={direction => setOrderedIds(nudge(orderedIdsRef.current, placedId, direction))}
        onDone={() => void done(placedId, flow.placedIndex)}
        onClose={() => setFlow(null)}
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
    dialogs,
    isPlacing: flow !== null,
    /** The debate the choice, comparison or confirmation is about (push-down binds to it). */
    activeEntityId: flow?.entityId ?? null,
  };
}
