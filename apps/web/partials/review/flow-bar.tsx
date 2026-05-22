'use client';

import * as React from 'react';

import cx from 'classnames';
import { Array as A, pipe } from 'effect';
import { AnimatePresence, motion } from 'framer-motion';
import pluralize from 'pluralize';
import { RemoveScroll } from 'react-remove-scroll';

import { useToast } from '~/core/hooks/use-toast';
import { Z_LAYER_CLASS } from '~/core/z-layers';
import { useDiff } from '~/core/state/diff-store';
import { useEditable } from '~/core/state/editable-store';
import { useStatusBar } from '~/core/state/status-bar-store';
import { syncedEntities } from '~/core/sync/store';
import { useRelations, useValues } from '~/core/sync/use-store';
import { Relation, Value } from '~/core/types';

import { Divider } from '~/design-system/divider';

import { ReviewEditsTip, useReviewEditsTip } from '../onboarding/review-edits-tip';

export const FlowBar = () => {
  const { state: statusBarState } = useStatusBar();
  const [toast] = useToast();
  const { editable } = useEditable();
  const { isReviewOpen, setIsReviewOpen, bumpReviewVersion } = useDiff();

  const allValues = useValues({
    selector: t => t.hasBeenPublished === false && t.isLocal === true,
    includeDeleted: true,
  });

  const allRelations = useRelations({
    includeDeleted: true,
    selector: r => r.hasBeenPublished === false && r.isLocal === true,
  });

  // Filter to only count net changes (exclude no-ops like created-then-deleted
  // relations and values/relations that match the remote state).
  const values = React.useMemo(() => getNetValues(allValues), [allValues]);
  const relations = React.useMemo(() => collapseSlotReplacements(getNetRelations(allRelations)), [allRelations]);

  const opsCount = values.length + relations.length;

  const entitiesCount = pipe(
    [...values.map(t => t.entity.id), ...relations.map(r => r.fromEntity.id)],
    r => [...new Set(r)],
    A.length
  );

  const spacesCount = pipe([...new Set([...values.map(t => t.spaceId), ...relations.map(r => r.spaceId)])], A.length);

  const hideFlowbar = opsCount === 0 || !editable || toast || statusBarState.reviewState !== 'idle';
  const flowBarSurfaceRef = React.useRef<HTMLDivElement>(null);
  const reviewEditsButtonRef = React.useRef<HTMLButtonElement>(null);
  const { open: reviewEditsTipOpen, dismiss: dismissReviewEditsTip } = useReviewEditsTip({
    flowBarVisible: !hideFlowbar,
  });

  // Publish the flow-bar's footprint as `--app-bottom-inset` while it's visible
  // so dropdowns (placement hook, table-filter results, etc.) can avoid sliding
  // underneath. 20px margin + 40px height + ~36px shadow/breathing room.
  // useLayoutEffect (not useEffect) so dropdowns that compute placement in their
  // own useLayoutEffect during the same commit see the updated inset rather than
  // a stale 0.
  React.useLayoutEffect(() => {
    if (hideFlowbar) return;
    const root = document.documentElement;
    root.style.setProperty('--app-bottom-inset', '96px');
    return () => {
      root.style.removeProperty('--app-bottom-inset');
    };
  }, [hideFlowbar]);

  return (
    <>
      <AnimatePresence>
        {!hideFlowbar && (
          <motion.div
            key="flowbar"
            variants={flowVariants}
            initial="hidden"
            animate="visible"
            exit="hidden"
            transition={transition}
            custom={!isReviewOpen}
            className={cx(
              `pointer-events-none fixed inset-x-0 bottom-5 ${Z_LAYER_CLASS.flowBar} flex justify-center text-button`,
              RemoveScroll.classNames.fullWidth
            )}
          >
            <div
              ref={flowBarSurfaceRef}
              className="pointer-events-auto inline-flex h-10 items-center overflow-hidden rounded-lg border border-divider bg-white shadow-lg"
            >
              <div className="inline-flex h-full items-center justify-center">
                <p className="inline-flex items-center px-3">
                  <span>{pluralize('edit', opsCount, true)}</span>
                </p>
                <Divider type="vertical" className="inline-block h-4 w-px" />
                <p className="inline-flex items-center px-3">
                  <span>{pluralize('entity', entitiesCount, true)}</span>
                </p>
                <Divider type="vertical" className="inline-block h-4 w-px" />
                <p className="inline-flex items-center px-3">
                  <span>{pluralize('space', spacesCount, true)}</span>
                </p>
              </div>
              <button
                ref={reviewEditsButtonRef}
                onClick={() => {
                  dismissReviewEditsTip();
                  bumpReviewVersion();
                  setIsReviewOpen(true);
                }}
                className="h-full border-l border-divider px-4 text-ctaPrimary hover:bg-ctaTertiary focus:bg-ctaTertiary"
              >
                Review edits
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      <ReviewEditsTip
        open={reviewEditsTipOpen}
        dismiss={dismissReviewEditsTip}
        anchorRef={reviewEditsButtonRef}
        spotlightRef={flowBarSurfaceRef}
      />
    </>
  );
};

/**
 * Filter values to only include net changes compared to the remote/synced state.
 * Excludes values created-then-deleted locally and values unchanged from remote.
 * Only compares against non-local values in syncedEntities because the SyncEngine
 * can bake local edits into syncedEntities during re-sync.
 */
function getNetValues(localValues: Value[]): Value[] {
  return localValues.filter(v => {
    const remoteEntity = syncedEntities.get(v.entity.id);

    if (v.isDeleted) {
      // If no remote entity exists, this value was created and deleted locally — net-zero
      if (!remoteEntity) return false;
      return remoteEntity.values.some(remote => remote.id === v.id && !remote.isLocal);
    }

    // If the value is unchanged from the remote version, skip it
    if (remoteEntity) {
      const remoteValue = remoteEntity.values.find(
        remote =>
          !remote.isLocal &&
          (remote.id === v.id || (remote.property.id === v.property.id && remote.spaceId === v.spaceId))
      );
      if (remoteValue && remoteValue.value === v.value) return false;
    }

    return true;
  });
}

/**
 * Filter relations to only include net changes compared to the remote/synced state.
 * Excludes relations created-then-deleted locally, relations identical to remote,
 * and delete+create pairs that restore the original state (cycling back).
 * Only compares against non-local relations in syncedEntities because the SyncEngine
 * can bake local edits into syncedEntities during re-sync.
 */
function getNetRelations(localRelations: Relation[]): Relation[] {
  // Build a set of semantic keys for active local relations
  const activeKeys = new Set(
    localRelations.filter(r => !r.isDeleted).map(r => `${r.fromEntity.id}:${r.type.id}:${r.toEntity.id}:${r.spaceId}`)
  );

  return localRelations.filter(r => {
    const remoteEntity = syncedEntities.get(r.fromEntity.id);

    if (r.isDeleted) {
      // If no remote entity, or the relation ID doesn't exist in remote,
      // this was created and deleted locally — net-zero
      if (!remoteEntity) return false;
      const remoteRelation = remoteEntity.relations.find(remote => remote.id === r.id && !remote.isLocal);
      if (!remoteRelation) return false;

      // If an active local relation restores the same (fromEntity, type, toEntity, space)
      // as the deleted remote relation, both cancel out — net-zero
      const remoteKey = `${remoteRelation.fromEntity.id}:${remoteRelation.type.id}:${remoteRelation.toEntity.id}:${remoteRelation.spaceId}`;
      if (activeKeys.has(remoteKey)) return false;

      return true;
    }

    // Active relation — skip if semantically identical to a remote relation.
    // Position is part of identity here: a pure reorder keeps the same
    // (from, type, to, space) but must still count as a change.
    if (remoteEntity) {
      const key = `${r.fromEntity.id}:${r.type.id}:${r.toEntity.id}:${r.spaceId}`;
      const matchesRemote = remoteEntity.relations.some(
        remote =>
          !remote.isLocal &&
          `${remote.fromEntity.id}:${remote.type.id}:${remote.toEntity.id}:${remote.spaceId}` === key &&
          (remote.position ?? null) === (r.position ?? null)
      );
      if (matchesRemote) return false;
    }

    return true;
  });
}

/**
 * Collapse a delete+add pair on the same (fromEntity, type, spaceId) slot into
 * a single edit. Changing a relation (e.g. a data block's view) is represented
 * on the wire as a delete of the old relation plus an add of a new one, but it
 * should be counted — and displayed — as one conceptual edit, matching how the
 * review UI renders it.
 *
 * Only collapses the unambiguous 1-delete + 1-add case. Multi-valued relations
 * (e.g. types) may produce several deletes and/or adds in the same group; those
 * can't be cleanly paired and are left alone so each op still counts.
 */
function collapseSlotReplacements(relations: Relation[]): Relation[] {
  const groups = new Map<string, { deleted: Relation[]; added: Relation[] }>();
  for (const r of relations) {
    const key = `${r.fromEntity.id}:${r.type.id}:${r.spaceId}`;
    let group = groups.get(key);
    if (!group) {
      group = { deleted: [], added: [] };
      groups.set(key, group);
    }
    if (r.isDeleted) group.deleted.push(r);
    else group.added.push(r);
  }

  const result: Relation[] = [];
  for (const { deleted, added } of groups.values()) {
    if (deleted.length === 1 && added.length === 1) {
      // Pure slot replacement — count as a single edit (the add represents the new state).
      result.push(added[0]);
      continue;
    }
    result.push(...added, ...deleted);
  }
  return result;
}

const flowVariants = {
  hidden: { opacity: 0, y: '4px' },
  visible: (custom: boolean) => ({
    opacity: custom ? 1 : 0,
    y: custom ? '0px' : '4px',
    transition: {
      type: 'spring' as const,
      duration: 0.15,
      bounce: 0,
      delay: custom ? 0.15 : 0,
    },
  }),
};

const transition = { type: 'spring' as const, duration: 0.15, bounce: 0 };
