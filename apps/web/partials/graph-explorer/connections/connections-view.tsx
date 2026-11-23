'use client';

import * as React from 'react';

import cx from 'classnames';

import { CLAIM_BAND_LABELS } from '~/core/graph-explorer/claim-band';
import { nodeClaimSpaceId } from '~/core/graph-explorer/claims-about';
import type { GraphEdge, GraphNode } from '~/core/graph-explorer/fetch-graph-neighbourhood';
import type { GraphFilter } from '~/core/graph-explorer/graph-filter';
import { GRAPH_KIND_LABELS } from '~/core/graph-explorer/graph-kinds';
import {
  DESKTOP_GRAPH_CAPS,
  type GraphKindFilter,
  PHONE_GRAPH_CAPS,
  type SelectedNode,
} from '~/core/graph-explorer/select-graph';
import { relationLabel } from '~/core/graph-explorer/spokes';
import { useGraphNeighbourhood } from '~/core/graph-explorer/use-graph-explorer';
import { useMediaQuery } from '~/core/hooks/use-media-query';

import { ClaimBatchRow, useClaimSpaceBatches } from '../graph-claim-list';
import { ConnectionsCanvas } from './connections-canvas';
import { BAND_SWATCHES, NodeCard } from './node-card';

/** The design switches to its phone numbers below 600px. */
const PHONE_QUERY = '(max-width: 599px)';

export function ConnectionsView({
  centreId,
  filter,
  hubId,
  topicSpaceId,
  onSelect,
  onPrefetch,
  emptyMessage,
}: {
  centreId: string;
  filter: GraphFilter;
  /** The scope's topic: shown, but never expanded in hop 2. */
  hubId: string | null;
  /** Claims resolve their space against it, as the Claims tab does. */
  topicSpaceId: string | null;
  onSelect: (node: GraphNode) => void;
  onPrefetch?: (id: string | null) => void;
  /** Shown under a centre with nothing around it. */
  emptyMessage: string;
}) {
  const phone = useMediaQuery(PHONE_QUERY);
  const [kindFilter, setKindFilter] = React.useState<GraphKindFilter>('all');
  const { selection, kinds, hop1 } = useGraphNeighbourhood({
    centreId,
    filter,
    caps: phone ? PHONE_GRAPH_CAPS : DESKTOP_GRAPH_CAPS,
    kindFilter,
    hubId,
  });

  const claimSpaces = React.useMemo(() => {
    const spaces = new Map<string, string>();
    for (const { node } of selection?.nodes ?? []) {
      if (node.kind !== 'claim') continue;
      const spaceId = nodeClaimSpaceId(node, topicSpaceId);
      if (spaceId) spaces.set(node.id, spaceId);
    }
    return spaces;
  }, [selection, topicSpaceId]);
  const claimTargets = React.useMemo(() => [...claimSpaces].map(([id, spaceId]) => ({ id, spaceId })), [claimSpaces]);
  const { status, batches } = useClaimSpaceBatches(claimTargets);

  const renderNode = React.useCallback(
    (entry: SelectedNode, isCentre: boolean) => {
      const spaceId = claimSpaces.get(entry.node.id) ?? null;
      const card = <NodeCard node={entry.node} hop={entry.hop} isCentre={isCentre} claimSpaceId={spaceId} />;
      return spaceId ? <ClaimBatchRow status={status[spaceId] ?? 'pending'}>{card}</ClaimBatchRow> : card;
    },
    [claimSpaces, status]
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

  const select = React.useCallback(
    (node: GraphNode) => {
      // A chip that would hide the new centre gives way, as in the design.
      if (kindFilter !== 'all' && node.kind !== kindFilter && node.kind !== 'topic') setKindFilter('all');
      onSelect(node);
    },
    [kindFilter, onSelect]
  );

  if (hop1.isError && !selection) {
    return (
      <DarkNote role="alert">
        Couldn’t load the connections.{' '}
        <button type="button" className="underline" onClick={() => void hop1.refetch()}>
          Try again
        </button>
      </DarkNote>
    );
  }
  if (!selection) return <DarkNote aria-busy>Loading connections…</DarkNote>;

  const chips: GraphKindFilter[] = ['all', ...kinds.filter(kind => kind !== 'topic')];

  return (
    <div className="flex h-full min-h-0 flex-col bg-[#0b0b0c]">
      {batches}
      {chips.length > 2 && (
        <div role="group" aria-label="Show" className="flex shrink-0 gap-2 overflow-x-auto px-4 py-3">
          {chips.map(kind => (
            <button
              key={kind}
              type="button"
              aria-pressed={kindFilter === kind}
              onClick={() => setKindFilter(kind)}
              className={cx(
                'shrink-0 rounded-full border px-4 py-[6px] text-[14px] whitespace-nowrap transition-colors',
                kindFilter === kind
                  ? 'border-white bg-white text-[#151515]'
                  : 'border-white/20 text-[#e6e6e6] hover:border-white/60'
              )}
            >
              {kind === 'all' ? 'Everything' : GRAPH_KIND_LABELS[kind]}
            </button>
          ))}
        </div>
      )}
      <div className="relative min-h-0 flex-1">
        <ConnectionsCanvas
          selection={selection}
          phone={phone}
          onSelect={select}
          onPrefetch={onPrefetch}
          renderNode={renderNode}
          labelFor={labelFor}
        >
          {selection.nodes.length === 1 && (
            <p className="pointer-events-none absolute inset-x-0 top-1/2 mt-16 text-center text-[13px] text-[#a8a8a8]">
              {emptyMessage}
            </p>
          )}
          <BandLegend />
        </ConnectionsCanvas>
      </div>
    </div>
  );
}

function BandLegend() {
  return (
    <div
      data-stage-control
      className="absolute bottom-4 left-4 z-[10000] flex flex-wrap gap-3 rounded-full bg-white/10 px-3 py-[6px] text-[12px] text-[#e6e6e6] lg:max-w-[calc(100%-80px)] lg:rounded-xl"
    >
      {(Object.keys(CLAIM_BAND_LABELS) as Array<keyof typeof CLAIM_BAND_LABELS>).map(band => (
        <span key={band} className="flex items-center gap-[6px]">
          <i className={cx('block h-[10px] w-[10px] rounded-[3px]', BAND_SWATCHES[band])} />
          {CLAIM_BAND_LABELS[band]}
        </span>
      ))}
      <span className="flex items-center gap-[6px]">
        <i className="block h-[10px] w-[10px] rounded-[3px] border border-white/30" />
        No responses yet
      </span>
    </div>
  );
}

function DarkNote({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div {...props} className="flex h-full items-center justify-center bg-[#0b0b0c] p-6 text-[14px] text-[#e6e6e6]">
      <p>{children}</p>
    </div>
  );
}
