'use client';

import * as React from 'react';

import cx from 'classnames';

import { Minus } from '~/design-system/icons/minus';
import { Plus } from '~/design-system/icons/plus';

import {
  THREAD_LEVEL_BRANCH_SEGMENT,
  THREAD_SEGMENT_DIM,
  THREAD_SEGMENT_DIM_STROKE,
  THREAD_SEGMENT_HI,
  THREAD_SEGMENT_HI_STROKE,
} from './comment-density';

/**
 * The connectors that hang a nested list off the row above it.
 *
 * Comment replies have always drawn these; the claim page's activity feed needs the same shape for
 * the claims that hang off a debate, because to a reader they are the same relationship — this row
 * belongs to that one — and drawing it two ways would say they were different.
 *
 * Every piece takes pixels rather than a `CommentDensity`, because the two ends of a connector can
 * belong to rows of different sizes. A claim hanging off a debate reaches back to a 44px-wide
 * keyframe column and lands on a 32px avatar; a reply hanging off a comment does both at 32. Taking
 * a single density would have quietly assumed those are the same number, which is exactly the class
 * of bug the geometry helpers in `comment-density.ts` exist to prevent.
 */

/** Width of the invisible hit area over a connector, so a 1px line is actually pressable. */
export const THREAD_BRANCH_HIT_PX = 20;

/**
 * Half a pixel, to put a control's centre on a 1px line rather than beside it.
 *
 * A 1px line drawn at x spans x..x+1, so its visual centre is x+0.5. Without this the toggle sits
 * consistently half a pixel left of the line it is supposed to be threaded onto, which reads as a
 * wobble on a retina display and as a clear miss on a 1x one.
 */
export const THREAD_LINE_CENTER_NUDGE_PX = 0.5;

/**
 * Clears a branch's highlight when the pointer or focus genuinely leaves it.
 *
 * Both handlers check `relatedTarget`: a pointer moving between the spine and the arm it feeds, or
 * focus stepping from one control in the branch to the next, is still inside the branch. Clearing
 * on those made a branch flicker as the reader tracked along it.
 */
export function branchPointerBlurProps(
  clearFocus: () => void
): Pick<React.HTMLAttributes<HTMLElement>, 'onPointerLeave' | 'onBlur'> {
  const leaveIfOutside = (event: React.PointerEvent<HTMLElement> | React.FocusEvent<HTMLElement>) => {
    const next = event.relatedTarget;
    // `relatedTarget` is EventTarget | null; only a Node is valid for `contains`.
    if (next instanceof Node && event.currentTarget.contains(next)) return;
    clearFocus();
  };
  return { onPointerLeave: leaveIfOutside, onBlur: leaveIfOutside };
}

/** What every connector needs to know about the branch it belongs to. */
type BranchFocusHandlers = {
  lit: boolean;
  onFocusBranch?: () => void;
  onPressBranch?: () => void;
  onClearFocus?: () => void;
};

/**
 * The vertical line descending from a row into the branch beneath it, which collapses that branch.
 *
 * Positioned absolutely inside the parent row's own relative box: `leftPx` is the centre of the
 * avatar (or thumbnail) it descends from, `topPx` is that element's bottom edge, and `heightPx` is
 * measured down to wherever the branch actually begins. Measured rather than computed because the
 * rows between are variable height — a body that wraps to three lines moves it.
 */
export function ThreadParentSpine({
  leftPx,
  topPx,
  heightPx,
  lit,
  label,
  onToggle,
  onFocusBranch,
  onPressBranch,
  onClearFocus,
}: BranchFocusHandlers & {
  leftPx: number;
  topPx: number;
  /** Null or non-positive while unmeasured, or when the branch is collapsed: nothing is drawn. */
  heightPx: number | null;
  label: string;
  onToggle: () => void;
}) {
  if (heightPx == null || heightPx <= 0) return null;

  return (
    <button
      type="button"
      aria-label={label}
      onClick={onToggle}
      onPointerEnter={onFocusBranch}
      onFocus={onFocusBranch}
      onPointerDown={onPressBranch}
      {...branchPointerBlurProps(onClearFocus ?? noop)}
      className="comment-branch-parent-hit comment-branch-parent-spine absolute z-[1] flex -translate-x-1/2 cursor-pointer justify-center border-0 bg-transparent p-0"
      style={{ left: `${leftPx}px`, top: `${topPx}px`, height: `${heightPx}px`, width: `${THREAD_BRANCH_HIT_PX}px` }}
    >
      <span
        className={cx(
          THREAD_LEVEL_BRANCH_SEGMENT,
          'w-px shrink-0 transition-colors',
          lit ? THREAD_SEGMENT_HI : THREAD_SEGMENT_DIM
        )}
      />
    </button>
  );
}

/**
 * The continuous line down the left of a branch, from its top to the last row's elbow.
 *
 * Stops at the last row rather than running the branch's full height: below that point the line
 * would be pointing at nothing, and the elbow is what carries the eye into the final row.
 */
export function ThreadListSpine({
  reachPx,
  heightPx,
  lit,
  collapsed,
  label,
  onToggle,
  onFocusBranch,
  onPressBranch,
  onClearFocus,
}: BranchFocusHandlers & {
  /** How far left of the branch's own edge the parent's spine sits. */
  reachPx: number;
  heightPx: number | null;
  collapsed: boolean;
  label: { expand: string; collapse: string };
  onToggle: () => void;
}) {
  if (heightPx == null || heightPx <= 0) return null;

  return (
    <button
      type="button"
      aria-expanded={!collapsed}
      aria-label={collapsed ? label.expand : label.collapse}
      onClick={onToggle}
      onPointerEnter={onFocusBranch}
      onFocus={onFocusBranch}
      onPointerDown={onPressBranch}
      {...branchPointerBlurProps(onClearFocus ?? noop)}
      className="comment-branch-hit comment-branch-parent-hit comment-branch-spine-hit absolute z-[1] flex -translate-x-1/2 cursor-pointer justify-center border-0 bg-transparent p-0"
      style={{
        left: `calc(${-reachPx}px + ${THREAD_LINE_CENTER_NUDGE_PX}px)`,
        top: 0,
        height: `${heightPx}px`,
        width: `${THREAD_BRANCH_HIT_PX}px`,
      }}
    >
      <span
        className={cx(
          THREAD_LEVEL_BRANCH_SEGMENT,
          'w-px shrink-0 transition-colors',
          lit ? THREAD_SEGMENT_HI : THREAD_SEGMENT_DIM
        )}
      />
    </button>
  );
}

/**
 * The quarter-turn into the final row of a branch.
 *
 * `armCenterPx` is where the row's own avatar centre is, which is not always half the reach — a
 * claim row's 32px avatar hangs off a debate's 44px keyframe column.
 */
export function ThreadElbow({ reachPx, armCenterPx, lit }: { reachPx: number; armCenterPx: number; lit: boolean }) {
  const armY = armCenterPx - 0.5;
  const radius = Math.min(9.5, Math.max(0, armY));
  const path = `M 0.5 0 L 0.5 ${armY - radius} Q 0.5 ${armY}, ${0.5 + radius} ${armY} L ${reachPx} ${armY}`;

  return (
    <svg
      className="pointer-events-none absolute overflow-visible"
      style={{ left: `${-reachPx}px`, top: 0, width: `${reachPx}px`, height: `${armCenterPx}px` }}
      viewBox={`0 0 ${reachPx} ${armCenterPx}`}
      fill="none"
      aria-hidden="true"
    >
      <path
        d={path}
        strokeWidth="1"
        fill="none"
        className={cx(
          THREAD_LEVEL_BRANCH_SEGMENT,
          'transition-colors',
          lit ? THREAD_SEGMENT_HI_STROKE : THREAD_SEGMENT_DIM_STROKE
        )}
      />
    </svg>
  );
}

/** The straight horizontal tick from the spine into a row that is not the last one. */
export function ThreadArm({ reachPx, armCenterPx, lit }: { reachPx: number; armCenterPx: number; lit: boolean }) {
  return (
    <div
      className={cx(
        THREAD_LEVEL_BRANCH_SEGMENT,
        'pointer-events-none absolute h-px transition-colors',
        lit ? THREAD_SEGMENT_HI : THREAD_SEGMENT_DIM
      )}
      style={{ left: `${-reachPx}px`, top: `${armCenterPx}px`, width: `${reachPx}px` }}
    />
  );
}

/**
 * The ⊖ / ⊕ threaded onto a parent's spine, which is how a branch is closed and reopened.
 *
 * Absolutely positioned when expanded, because it has to sit *on* the descending line — which is
 * outside its own row's body box, hence the negative offset the caller computes. Collapsed it takes
 * the avatar's place in the row, since there is no line left to sit on.
 */
export function ThreadCollapseToggle({
  collapsed,
  leftPx,
  label,
  onToggle,
  onFocusBranch,
  onPressBranch,
  onClearFocus,
}: Omit<BranchFocusHandlers, 'lit'> & {
  collapsed: boolean;
  /** Offset from the row's body edge back to the spine. Ignored when collapsed. */
  leftPx?: number;
  label: { expand: string; collapse: string };
  onToggle: () => void;
}) {
  const shared = {
    type: 'button' as const,
    'aria-expanded': !collapsed,
    'aria-label': collapsed ? label.expand : label.collapse,
    onClick: onToggle,
  };

  if (collapsed) {
    return (
      <button
        {...shared}
        className="z-[2] flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center rounded-full border border-grey-02 bg-bg text-grey-04 hover:bg-grey-01"
      >
        <span className="inline-flex scale-[0.55] leading-none">
          <Plus color="grey-04" />
        </span>
      </button>
    );
  }

  return (
    <button
      {...shared}
      onPointerEnter={onFocusBranch}
      onFocus={onFocusBranch}
      onPointerDown={onPressBranch}
      {...branchPointerBlurProps(onClearFocus ?? noop)}
      className="comment-branch-parent-hit pointer-events-auto absolute top-1/2 z-[2] flex h-6 w-6 -translate-x-1/2 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full border border-grey-02 bg-bg text-grey-04 hover:bg-grey-01"
      style={{ left: `calc(${leftPx ?? 0}px + ${THREAD_LINE_CENTER_NUDGE_PX}px)` }}
    >
      <span className="inline-flex scale-[0.55] leading-none">
        <Minus color="grey-04" />
      </span>
    </button>
  );
}

function noop() {}
