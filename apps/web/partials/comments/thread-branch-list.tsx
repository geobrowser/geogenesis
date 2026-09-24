'use client';

import * as React from 'react';

import { type CommentDensity, threadArmCenterPx, threadSpineOffsetPx } from './comment-density';
import { ThreadArm, ThreadElbow, ThreadListSpine } from './thread-branch';

/**
 * A branch of rows hanging off the row above it, with its spine, arms and elbow.
 *
 * The claim page's activity feed grows several of these — claims under a debate, comments under a
 * debate, replies under one of those comments — and each was otherwise re-deriving the same
 * measurement and the same per-row connector choice. `CommentList` still draws its own, because its
 * rows carry highlight state these do not; what is shared is the geometry and the pieces.
 */

type BranchGeometry = {
  /** How far left of this branch's edge the parent's spine sits. */
  reachPx: number;
  /** Where a row's own avatar centre is, which is what an arm has to land on. */
  armCenterPx: number;
  registerLastRow: React.Ref<HTMLDivElement>;
};

const ThreadBranchContext = React.createContext<BranchGeometry | null>(null);

export function ThreadBranch({
  density,
  reachPx,
  armCenterPx,
  onCollapse,
  label,
  children,
}: {
  /**
   * The *parent* row's density, which is what the connectors reach back across. Defaults are taken
   * from it; a parent whose left column is not an avatar — a debate's keyframe — passes its own.
   */
  density: CommentDensity;
  reachPx?: number;
  armCenterPx?: number;
  /** Omitted where the branch has no collapse of its own; the spine is then inert. */
  onCollapse?: () => void;
  label?: { expand: string; collapse: string };
  children: React.ReactNode;
}) {
  const reach = reachPx ?? threadSpineOffsetPx(density);
  const arm = armCenterPx ?? threadArmCenterPx(density);

  // Measured rather than computed: the spine stops at the last row's elbow, and these rows are
  // variable height — a claim sentence wraps to one line or three, a comment to more.
  const listRef = React.useRef<HTMLDivElement>(null);
  const lastRowRef = React.useRef<HTMLDivElement>(null);
  const [spineHeightPx, setSpineHeightPx] = React.useState<number | null>(null);

  const measure = React.useCallback(() => {
    const list = listRef.current;
    const lastRow = lastRowRef.current;
    if (!list || !lastRow) {
      setSpineHeightPx(null);
      return;
    }
    setSpineHeightPx(lastRow.getBoundingClientRect().top - list.getBoundingClientRect().top);
  }, []);

  React.useLayoutEffect(() => {
    measure();
    const list = listRef.current;
    if (list == null || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => measure());
    observer.observe(list);
    return () => observer.disconnect();
  });

  const geometry = React.useMemo<BranchGeometry>(
    () => ({ reachPx: reach, armCenterPx: arm, registerLastRow: lastRowRef }),
    [arm, reach]
  );

  return (
    <ThreadBranchContext.Provider value={geometry}>
      <div className="comment-branch-list-root relative flex flex-col gap-4" ref={listRef}>
        {onCollapse && label && (
          <ThreadListSpine
            reachPx={reach}
            heightPx={spineHeightPx}
            lit={false}
            collapsed={false}
            onToggle={onCollapse}
            label={label}
          />
        )}
        {children}
      </div>
    </ThreadBranchContext.Provider>
  );
}

/** One row in a branch, with the connector tying it back to the spine. */
export function ThreadBranchRow({
  isLast,
  density,
  children,
}: {
  isLast: boolean;
  /** Only used when this row is rendered outside a {@link ThreadBranch}, which should not happen. */
  density?: CommentDensity;
  children: React.ReactNode;
}) {
  const branch = React.useContext(ThreadBranchContext);
  const reachPx = branch?.reachPx ?? (density ? threadSpineOffsetPx(density) : 28);
  const armCenterPx = branch?.armCenterPx ?? (density ? threadArmCenterPx(density) : 16);

  return (
    <div className="comment-branch-row relative" ref={isLast ? branch?.registerLastRow : undefined}>
      <div className="comment-branch-row-connectors pointer-events-none absolute inset-0 z-[1]">
        {isLast ? (
          <ThreadElbow reachPx={reachPx} armCenterPx={armCenterPx} lit={false} />
        ) : (
          <ThreadArm reachPx={reachPx} armCenterPx={armCenterPx} lit={false} />
        )}
      </div>
      {children}
    </div>
  );
}
