'use client';

import * as React from 'react';

import cx from 'classnames';
import { Array as A, pipe } from 'effect';
import { AnimatePresence, motion } from 'framer-motion';
import { useAtomValue } from 'jotai';
import pluralize from 'pluralize';
import { RemoveScroll } from 'react-remove-scroll';

import { useAppBottomInset } from '~/core/app-bottom-inset';
import { useEnterAnimationSettled } from '~/core/hooks/use-enter-animation-settled';
import { useToast } from '~/core/hooks/use-toast';
import { useNetChanges } from '~/core/review/use-net-changes';
import { useDiff } from '~/core/state/diff-store';
import { useEditable } from '~/core/state/editable-store';
import { useStatusBar } from '~/core/state/status-bar-store';
import { Relation } from '~/core/types';
import { Z_LAYER_CLASS } from '~/core/z-layers';

import { Divider } from '~/design-system/divider';

import { ReviewEditsTip, useReviewEditsTip } from '~/partials/hints/review-edits-tip';

import { shouldHideFlowBar } from './flow-bar-visibility';
import { entitySidePanelWantsEditAtom } from '~/atoms';

export const FlowBar = () => {
  const { state: statusBarState } = useStatusBar();
  const [toast] = useToast();
  const { editable } = useEditable();
  const sidePanelWantsEdit = useAtomValue(entitySidePanelWantsEditAtom);
  const { isReviewOpen, setIsReviewOpen, bumpReviewVersion } = useDiff();

  const { values, relations: netRelations, spaceIds } = useNetChanges();
  const relations = React.useMemo(() => collapseSlotReplacements(netRelations), [netRelations]);

  const opsCount = values.length + relations.length;

  const entitiesCount = pipe(
    [...values.map(t => t.entity.id), ...relations.map(r => r.fromEntity.id)],
    r => [...new Set(r)],
    A.length
  );

  const spacesCount = spaceIds.length;

  const hideFlowbar = shouldHideFlowBar({
    opsCount,
    editable,
    sidePanelWantsEdit,
    hasToast: Boolean(toast),
    reviewState: statusBarState.reviewState,
  });
  const flowBarVisible = !hideFlowbar;
  const { settled: flowBarEnterSettled, onEnterAnimationComplete: onFlowBarEnterAnimationComplete } =
    useEnterAnimationSettled(flowBarVisible);
  const flowBarSurfaceRef = React.useRef<HTMLDivElement>(null);
  const reviewEditsButtonRef = React.useRef<HTMLButtonElement>(null);
  const { open: reviewEditsTipOpen, dismiss: dismissReviewEditsTip } = useReviewEditsTip({
    flowBarVisible,
    flowBarEnterSettled,
  });

  // Publish the flow-bar's footprint so dropdowns (placement hook, table-filter results, etc.)
  // and the bottom-right assistant can avoid sliding underneath. 20px margin + 40px height +
  // ~36px shadow/breathing room.
  useAppBottomInset('flow-bar', 96, flowBarVisible);

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
            onAnimationComplete={onFlowBarEnterAnimationComplete}
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
