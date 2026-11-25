'use client';

import * as React from 'react';

import cx from 'classnames';
import { useReducedMotion } from 'framer-motion';

import { CLAIM_BAND_LABELS } from '~/core/graph-explorer/claim-band';
import { nodeClaimSpaceId } from '~/core/graph-explorer/claims-about';
import type { GraphEdge, GraphNode } from '~/core/graph-explorer/fetch-graph-neighbourhood';
import type { GraphSelection, SelectedNode } from '~/core/graph-explorer/select-graph';
import { isSkeletonNode, isSkeletonSelection } from '~/core/graph-explorer/skeleton-graph';
import { relationLabel } from '~/core/graph-explorer/spokes';

import { ClaimBatchRow, useClaimSpaceBatches } from '../graph-claim-list';
import { ConnectionsCanvas } from './connections-canvas';
import { BAND_SWATCHES, NodeCard } from './node-card';
import { SkeletonNode } from './skeleton-node';

/** The design switches to its phone numbers below 600px. */
export const PHONE_QUERY = '(max-width: 599px)';

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
        <NodeCard node={entry.node} hop={entry.hop} isCentre={isCentre} phone={phone} claimSpaceId={spaceId} />
      );
      return spaceId ? <ClaimBatchRow status={status[spaceId] ?? 'pending'}>{card}</ClaimBatchRow> : card;
    },
    [claimSpaces, phone, reduceMotion, status]
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
        <BandLegend />
      </ConnectionsCanvas>
    </>
  );
}

/**
 * On a phone the legend keeps to one line beside the zoom controls: the three bands only, since an
 * unvoted card reads as plain without a key.
 */
export function BandLegend() {
  return (
    <div
      data-stage-control
      data-testid="band-legend"
      className="absolute bottom-4 left-4 z-[10000] flex max-w-[calc(100%-80px)] flex-wrap gap-x-3 gap-y-1 rounded-xl bg-white/10 px-3 py-[6px] text-[12px] text-[#e6e6e6] md:max-w-[calc(100%-68px)] md:flex-nowrap md:gap-x-2.5 md:px-2.5 md:whitespace-nowrap"
    >
      {(Object.keys(CLAIM_BAND_LABELS) as Array<keyof typeof CLAIM_BAND_LABELS>).map(band => (
        <span key={band} className="flex shrink-0 items-center gap-[6px]">
          <i className={cx('block h-[10px] w-[10px] rounded-[3px]', BAND_SWATCHES[band])} />
          {CLAIM_BAND_LABELS[band]}
        </span>
      ))}
      <span data-legend-unvoted className="flex items-center gap-[6px] md:hidden">
        <i className="block h-[10px] w-[10px] rounded-[3px] border border-white/30" />
        No responses yet
      </span>
    </div>
  );
}
