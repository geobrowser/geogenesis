'use client';

import * as React from 'react';

import cx from 'classnames';

import {
  type CommentDensity,
  THREAD_SEGMENT_DIM,
  THREAD_SEGMENT_DIM_STROKE,
  THREAD_SEGMENT_HI,
  THREAD_SEGMENT_HI_STROKE,
  THREAD_LEVEL_BRANCH_SEGMENT,
  threadArmCenterPx,
  threadSpineOffsetPx,
} from './comment-density';

/**
 * The connectors that hang a nested list off the row above it.
 *
 * Comment replies have always drawn these; the claim page's activity feed needs the same shape for
 * the claims that hang off a debate, because to a reader they are the same relationship — this row
 * belongs to that one — and drawing it two ways would say they were different.
 *
 * Geometry comes from `comment-density.ts` rather than from constants here, so a branch follows
 * whatever avatar size the surrounding thread is using. The segment classes are shared for the same
 * reason: a hover that lights one branch and not another is the tell that there are two of these.
 */

/** Width of the invisible hit area over a connector, so a 1px line is actually pressable. */
export const THREAD_BRANCH_HIT_PX = 20;

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

/**
 * The elbow the last row in a branch gets: down the spine, then a quarter-turn into the row.
 *
 * Drawn rather than composed from a border radius because it has to land on the row's avatar centre,
 * which moves with density — at the panel's 20px avatar the arm sits 16px down a 32px row, not 10px.
 */
export function threadElbowPath(density: CommentDensity): string {
  const spineOffsetPx = threadSpineOffsetPx(density);
  const armY = threadArmCenterPx(density) - 0.5;
  const radius = Math.min(9.5, Math.max(0, armY));
  return `M 0.5 0 L 0.5 ${armY - radius} Q 0.5 ${armY}, ${0.5 + radius} ${armY} L ${spineOffsetPx} ${armY}`;
}

/**
 * The continuous vertical line down the left of a branch, which collapses it when pressed.
 *
 * Stops at the last row rather than running the branch's full height: below that point the line
 * would be pointing at nothing, and the elbow is what carries the eye into the final row.
 */
export function ThreadSpine({
  density,
  heightPx,
  lit,
  collapsed,
  onToggle,
  onFocusBranch,
  onPressBranch,
  onClearFocus,
  label,
}: {
  density: CommentDensity;
  /** Distance to the last row's arm. Null while unmeasured — the spine simply isn't drawn yet. */
  heightPx: number | null;
  lit: boolean;
  collapsed: boolean;
  onToggle: () => void;
  onFocusBranch: () => void;
  onPressBranch: () => void;
  onClearFocus: () => void;
  label: { expand: string; collapse: string };
}) {
  if (heightPx == null) return null;

  return (
    <button
      type="button"
      aria-expanded={!collapsed}
      aria-label={collapsed ? label.expand : label.collapse}
      onClick={onToggle}
      onPointerEnter={onFocusBranch}
      onFocus={onFocusBranch}
      onPointerDown={onPressBranch}
      {...branchPointerBlurProps(onClearFocus)}
      className="comment-branch-hit comment-branch-parent-hit comment-branch-spine-hit absolute z-[1] flex -translate-x-1/2 cursor-pointer justify-center border-0 bg-transparent p-0"
      style={{
        left: `calc(${-threadSpineOffsetPx(density)}px + 0.5px)`,
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

/** The quarter-turn into the final row of a branch. */
export function ThreadElbow({ density, lit }: { density: CommentDensity; lit: boolean }) {
  const spineOffsetPx = threadSpineOffsetPx(density);
  const armCenterPx = threadArmCenterPx(density);

  return (
    <svg
      className="pointer-events-none overflow-visible"
      style={{ width: `${spineOffsetPx}px`, height: `${armCenterPx}px` }}
      viewBox={`0 0 ${spineOffsetPx} ${armCenterPx}`}
      fill="none"
      aria-hidden="true"
    >
      <path
        d={threadElbowPath(density)}
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
export function ThreadArm({ density, lit }: { density: CommentDensity; lit: boolean }) {
  return (
    <div
      className={cx(
        THREAD_LEVEL_BRANCH_SEGMENT,
        'pointer-events-none absolute h-px transition-colors',
        lit ? THREAD_SEGMENT_HI : THREAD_SEGMENT_DIM
      )}
      style={{
        left: `${-threadSpineOffsetPx(density)}px`,
        top: `${threadArmCenterPx(density)}px`,
        width: `${threadSpineOffsetPx(density)}px`,
      }}
    />
  );
}
