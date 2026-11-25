'use client';

import * as Popover from '@radix-ui/react-popover';

import * as React from 'react';

import cx from 'classnames';
import { useReducedMotion } from 'framer-motion';

import { CLAIM_BAND_LABELS } from '~/core/graph-explorer/claim-band';
import { nodeClaimSpaceId } from '~/core/graph-explorer/claims-about';
import type { GraphEdge, GraphNode } from '~/core/graph-explorer/fetch-graph-neighbourhood';
import { useGraphAnalytics } from '~/core/graph-explorer/graph-explorer-analytics';
import type { GraphSelection, SelectedNode } from '~/core/graph-explorer/select-graph';
import { isSkeletonNode, isSkeletonSelection } from '~/core/graph-explorer/skeleton-graph';
import { relationLabel } from '~/core/graph-explorer/spokes';

import { InfoSmall } from '~/design-system/icons/info-small';
import { useElevatedPopoverPortal } from '~/design-system/use-elevated-popover-portal';

import { ClaimBatchRow, useClaimSpaceBatches } from '../graph-claim-list';
import { ConnectionsCanvas } from './connections-canvas';
import { BAND_SWATCHES, NodeCard } from './node-card';
import { SkeletonNode } from './skeleton-node';

/** The dark stage: the 3D map, its legend and hint. Claims read their counts per resolved space. */
export function ConnectionsStage({
  selection,
  phone,
  topicSpaceId,
  onSelect,
  onPrefetch,
  emptyMessage,
}: {
  selection: GraphSelection;
  phone: boolean;
  /** Claims resolve their space against it, as the Claims tab does. */
  topicSpaceId: string | null;
  onSelect: (node: GraphNode) => void;
  onPrefetch?: (id: string | null) => void;
  /** Shown under a centre with nothing around it. */
  emptyMessage: string;
}) {
  const claimSpaces = React.useMemo(() => {
    const spaces = new Map<string, string>();
    for (const { node } of selection.nodes) {
      if (node.kind !== 'claim' || isSkeletonNode(node)) continue;
      const spaceId = nodeClaimSpaceId(node, topicSpaceId);
      if (spaceId) spaces.set(node.id, spaceId);
    }
    return spaces;
  }, [selection, topicSpaceId]);
  const claimTargets = React.useMemo(() => [...claimSpaces].map(([id, spaceId]) => ({ id, spaceId })), [claimSpaces]);
  const { status, batches } = useClaimSpaceBatches(claimTargets);

  const reduceMotion = useReducedMotion() ?? false;
  const centreId = selection.nodes[0]?.node.id ?? null;
  const renderNode = React.useCallback(
    (entry: SelectedNode, isCentre: boolean) => {
      if (isSkeletonNode(entry.node))
        return (
          <SkeletonNode
            kind={entry.node.kind === 'claim' ? 'claim' : 'ent'}
            isCentre={isCentre}
            phone={phone}
            pulse={!reduceMotion && 'animate-pulse'}
          />
        );
      const spaceId = claimSpaces.get(entry.node.id) ?? null;
      const card = (
        <NodeCard
          node={entry.node}
          hop={entry.hop}
          isCentre={isCentre}
          phone={phone}
          claimSpaceId={spaceId}
          centreId={centreId}
        />
      );
      return spaceId ? <ClaimBatchRow status={status[spaceId] ?? 'pending'}>{card}</ClaimBatchRow> : card;
    },
    [centreId, claimSpaces, phone, reduceMotion, status]
  );

  const labelFor = React.useCallback(
    (edge: GraphEdge, fromId: string) =>
      relationLabel({
        propertyId: edge.propertyId,
        propertyName: edge.propertyName,
        direction: edge.fromId === fromId ? 'out' : 'in',
      }),
    []
  );

  return (
    <>
      {batches}
      <ConnectionsCanvas
        controls={phone ? <BandKey /> : null}
        selection={selection}
        phone={phone}
        onSelect={onSelect}
        onPrefetch={onPrefetch}
        renderNode={renderNode}
        labelFor={labelFor}
      >
        {selection.nodes.length === 1 && !isSkeletonSelection(selection) && (
          <p className="pointer-events-none absolute inset-x-6 top-1/2 mt-20 text-center text-[13px] text-[#a8a8a8]">
            {emptyMessage}
          </p>
        )}
        {!phone && <BandLegend />}
      </ConnectionsCanvas>
    </>
  );
}

/** The three band swatches with their labels: one source for the legend and the phone key. */
function BandItems() {
  return (
    <>
      {(Object.keys(CLAIM_BAND_LABELS) as Array<keyof typeof CLAIM_BAND_LABELS>).map(band => (
        <span key={band} className="flex items-center gap-[6px] whitespace-nowrap">
          <i className={cx('block h-[10px] w-[10px] rounded-[3px]', BAND_SWATCHES[band])} />
          {CLAIM_BAND_LABELS[band]}
        </span>
      ))}
    </>
  );
}

/**
 * The legend over the map from 600px up. On a tablet it drops to the three bands, since an unvoted
 * card reads as plain without a key, and wraps between whole items rather than running under the
 * zoom controls. A phone shows `BandKey` in the zoom stack instead (GEO-3849).
 */
export function BandLegend() {
  return (
    <div
      data-stage-control
      data-testid="band-legend"
      className="absolute bottom-4 left-4 z-[10000] flex max-w-[calc(100%-80px)] flex-wrap gap-x-3 gap-y-1 rounded-xl bg-white/10 px-3 py-[6px] text-[12px] text-[#e6e6e6] md:max-w-[calc(100%-68px)] md:gap-x-2.5 md:px-2.5 graph-phone:hidden"
    >
      <BandItems />
      <span data-legend-unvoted className="flex items-center gap-[6px] whitespace-nowrap md:hidden">
        <i className="block h-[10px] w-[10px] rounded-[3px] border border-white/30" />
        No responses yet
      </span>
    </div>
  );
}

/**
 * On a phone the legend took a line of the map, so it sits behind a key button at the top of the zoom
 * stack: a tap opens the three bands beside it, and a second tap, a tap outside or Escape closes them.
 * It portals out of the stage so the map's overflow can't clip it.
 */
export function BandKey() {
  const analytics = useGraphAnalytics();
  const portal = useElevatedPopoverPortal();
  const [open, setOpen] = React.useState(false);
  const onOpenChange = React.useCallback(
    (next: boolean) => {
      setOpen(next);
      if (next) analytics?.interacted({ interaction: 'legend' });
    },
    [analytics]
  );

  return (
    <Popover.Root open={open} onOpenChange={onOpenChange}>
      <Popover.Trigger asChild>
        <button
          type="button"
          aria-label="Show color key"
          data-testid="band-key"
          className="flex h-9 w-9 items-center justify-center rounded-full border border-white/20 bg-[rgba(30,30,33,.85)] text-[#f2f2f2] hover:border-white"
        >
          <InfoSmall />
        </button>
      </Popover.Trigger>
      {portal ? (
        <Popover.Portal container={portal}>
          <Popover.Content
            side="left"
            align="start"
            sideOffset={8}
            collisionPadding={16}
            aria-label="Color key"
            data-testid="band-key-items"
            className="flex flex-col gap-2 rounded-xl border border-white/20 bg-[rgba(30,30,33,.95)] px-3 py-2.5 text-[12px] text-[#e6e6e6]"
          >
            <BandItems />
          </Popover.Content>
        </Popover.Portal>
      ) : null}
    </Popover.Root>
  );
}
