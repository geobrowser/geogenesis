'use client';

import * as React from 'react';

import { BEST_DEBATES_RANKING_LIVE } from '~/core/blocks/ranking/best-debates';
import { pushDownChoiceDescription } from '~/core/blocks/ranking/push-down';
import { type UsePushDownResult, usePushDown } from '~/core/blocks/ranking/use-push-down';
import { normId } from '~/core/utils/norm-id';

import type { PushDownSlot } from './rank-choice-dialog';

type Report = (debateId: string, pushDown: UsePushDownResult) => void;
type Release = (debateId: string) => void;

/**
 * Runs `usePushDown` for one debate and reports it to `useBestDebatesPushDownSlot`. Mounted only for
 * the debate the placement flow is on, so the screen reads one debate's votes at a time rather than
 * every debate it lists. Render it inside `RankingComposeBallotContext`, so Push it down edits the
 * screen's draft rather than the published ballot.
 */
function PushDownBinding({
  debateId,
  blockId,
  onReport,
  onRelease,
}: {
  debateId: string;
  blockId: string;
  onReport: Report;
  onRelease: Release;
}) {
  const pushDown = usePushDown(debateId, { blockId });
  // Every render: the actions read their newest closures. `onReport` only re-renders the screen
  // when readiness changes.
  React.useEffect(() => onReport(debateId, pushDown));
  React.useEffect(() => () => onRelease(debateId), [debateId, onRelease]);
  return null;
}

/**
 * GEO-3679's push-down as GEO-3678's `PushDownSlot` (the Rank it / Push it down choice and the
 * Placed confirmation's publish), for the Best debates ranking screen.
 *
 * - `onSelect`: `usePushDown(id).pushDown()` (downvote, then the draft edit).
 * - `rank`: `usePushDown(id).rank(publish)` (publish, then clear a downvote the ranker held). The
 *   ranking went out when the run succeeded, or failed only at the clear (`partly`), which its
 *   pushed-down row then offers to Retry.
 * - `isReady`: the ranker's vote on the debate has loaded (`isVoteKnown`).
 * - `description`: `pushDownChoiceDescription(BEST_DEBATES_RANKING_LIVE)`.
 *
 * `binding(activeEntityId)` is the element that runs `usePushDown` for the debate in the flow.
 */
export function useBestDebatesPushDownSlot({
  blockId,
  pushedDownEntityIds,
}: {
  /** The Best debates block; null when the screen isn't Best debates (no slot, nothing bound). */
  blockId: string | null;
  /** The debates the ranker pushed down, kept out of To rank. */
  pushedDownEntityIds: readonly string[];
}) {
  const bindings = React.useRef(new Map<string, UsePushDownResult>());
  const [readyIds, setReadyIds] = React.useState<ReadonlySet<string>>(() => new Set());

  const setReady = React.useCallback((debateId: string, ready: boolean) => {
    const key = normId(debateId);
    setReadyIds(previous => {
      if (previous.has(key) === ready) return previous;
      const next = new Set(previous);
      if (ready) next.add(key);
      else next.delete(key);
      return next;
    });
  }, []);

  const onReport = React.useCallback<Report>(
    (debateId, pushDown) => {
      bindings.current.set(normId(debateId), pushDown);
      setReady(debateId, pushDown.isVoteKnown);
    },
    [setReady]
  );

  const onRelease = React.useCallback<Release>(
    debateId => {
      bindings.current.delete(normId(debateId));
      setReady(debateId, false);
    },
    [setReady]
  );

  const slot = React.useMemo((): (PushDownSlot & { pushedDownEntityIds: readonly string[] }) | undefined => {
    if (!blockId) return undefined;
    return {
      onSelect: entityId => void bindings.current.get(normId(entityId))?.pushDown(),
      description: pushDownChoiceDescription(BEST_DEBATES_RANKING_LIVE),
      rank: async (entityId, publish) => {
        const pushDown = bindings.current.get(normId(entityId));
        // No vote to clear can be known: publish as a plain placement.
        if (!pushDown?.isVoteKnown) return publish();
        const result = await pushDown.rank(publish);
        return result.ok || result.partly;
      },
      isReady: entityId => readyIds.has(normId(entityId)),
      pushedDownEntityIds,
    };
  }, [blockId, pushedDownEntityIds, readyIds]);

  const binding = (activeEntityId: string | null) =>
    blockId && activeEntityId ? (
      <PushDownBinding
        key={normId(activeEntityId)}
        debateId={activeEntityId}
        blockId={blockId}
        onReport={onReport}
        onRelease={onRelease}
      />
    ) : null;

  return { slot, binding };
}
