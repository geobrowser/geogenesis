'use client';

import cx from 'classnames';

import { staticSkeleton } from '~/core/graph-explorer/skeleton-graph';

import { Skeleton } from '~/design-system/skeleton';

import { STAGE_BACKGROUND } from './connections/connections-canvas';
import { SkeletonNode } from './connections/skeleton-node';

const DESKTOP_NODES = staticSkeleton(false);
const PHONE_NODES = staticSkeleton(true);
/** The viewer's phone query (max-width 599px), as CSS so the server markup needs no media query. */
const ON_DESKTOP = 'max-[599px]:hidden';
const ON_PHONE = 'min-[600px]:hidden';

/**
 * The stage as the map first draws its skeleton, as plain DOM: server-rendered, so the first paint
 * is the dark stage with placeholders. The live canvas takes over after hydration.
 */
export function StaticSkeletonStage() {
  return (
    <div
      aria-busy="true"
      data-testid="graph-skeleton-stage"
      className={cx('relative h-full w-full overflow-hidden', STAGE_BACKGROUND)}
    >
      <p className="sr-only">Loading connections</p>
      {[
        { nodes: DESKTOP_NODES, phone: false, visible: ON_DESKTOP },
        { nodes: PHONE_NODES, phone: true, visible: ON_PHONE },
      ].map(({ nodes, phone, visible }) => (
        <div key={phone ? 'phone' : 'desktop'} aria-hidden className={cx('absolute inset-0', visible)}>
          {nodes.map(node => (
            <span
              key={node.id}
              data-skeleton-node
              className="absolute"
              style={{
                left: `${node.left}%`,
                top: `${node.top}%`,
                opacity: node.opacity,
                transform: `translate(-50%, -50%) scale(${node.scale})`,
                zIndex: node.hop === 0 ? 2 : 1,
              }}
            >
              <SkeletonNode
                kind={node.kind}
                isCentre={node.hop === 0}
                phone={phone}
                pulse="motion-safe:animate-pulse"
              />
            </span>
          ))}
        </div>
      ))}
    </div>
  );
}

/** The explorer's layout with skeletons in it: the page before hydration, server-rendered. */
export function GraphExplorerShell() {
  return (
    <div
      data-testid="graph-explorer-shell"
      className="flex h-[100dvh] flex-col overflow-hidden bg-white md:h-auto md:min-h-[100dvh] md:overflow-visible"
    >
      {/* On a phone, the top bar's two rows: path, search, close; then the chips. */}
      <div className="flex shrink-0 items-center gap-3 border-b border-[#f0f0f0] bg-white px-4 py-3 md:flex-wrap md:gap-2 md:px-3 md:py-2">
        <Skeleton className="h-5 w-[180px] rounded-md" />
        <Skeleton className="ml-auto h-9 w-[260px] rounded-full md:hidden" />
        <Skeleton className="hidden md:ml-auto md:block md:h-8 md:w-8" radius="rounded-full" />
        <Skeleton className="h-9 w-9 md:h-8 md:w-8" radius="rounded-full" />
        <Skeleton className="hidden md:block md:h-8 md:basis-full md:rounded-full" />
      </div>
      <div className="flex min-h-0 flex-1 md:flex-none md:flex-col">
        <div className="relative isolate min-w-0 flex-1 overflow-hidden bg-[#0b0b0c] md:h-[calc(62vh+88px)] md:min-h-[400px] md:flex-none">
          <StaticSkeletonStage />
        </div>
        <aside
          aria-hidden
          className="flex w-[360px] shrink-0 flex-col gap-3 border-l border-[#f0f0f0] bg-white p-6 md:w-auto md:border-t md:border-l-0 md:p-4"
        >
          <Skeleton className="h-12 w-full rounded-lg" />
          <Skeleton className="h-[200px] w-full rounded-lg" />
        </aside>
      </div>
    </div>
  );
}
