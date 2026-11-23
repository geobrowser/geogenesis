'use client';

import * as React from 'react';

import { centreTextInSpace } from '~/core/graph-explorer/centre-text';
import { nodeClaimSpaceId } from '~/core/graph-explorer/claims-about';
import { type GraphNode, hop1AsGraphHop } from '~/core/graph-explorer/fetch-graph-neighbourhood';
import { type GraphFilterOverrides, type GraphScope, resolveGraphFilter } from '~/core/graph-explorer/graph-filter';
import { graphKindOf } from '~/core/graph-explorer/graph-kinds';
import { type GraphHistory, goBack, recentre } from '~/core/graph-explorer/history';
import { DESKTOP_GRAPH_CAPS, type GraphKindFilter, PHONE_GRAPH_CAPS } from '~/core/graph-explorer/select-graph';
import { type Spoke, buildSpokes, entitySpaceId } from '~/core/graph-explorer/spokes';
import {
  useClaimsAbout,
  useGraphHop,
  useGraphNeighbourhood,
  usePrefetchGraphHop,
} from '~/core/graph-explorer/use-graph-explorer';
import { useMediaQuery } from '~/core/hooks/use-media-query';
import { useQueryEntity } from '~/core/sync/use-store';
import { normId } from '~/core/utils/norm-id';

import { Skeleton } from '~/design-system/skeleton';

import { ClaimActions, KindCounts, TopicClaimsSummary } from './connections/centre-summary';
import { ConnectionsStage, PHONE_QUERY } from './connections/connections-view';
import { GraphSearch } from './connections/graph-search';
import { GraphTopBar } from './connections/graph-top-bar';
import { claimsEmptyMessage, descriptionEmptyMessage, relationshipsEmptyMessage } from './empty-states';
import { EntityPanel, type EntityPanelTab } from './entity-panel';

/**
 * The Connections view: a top bar, the 3D map of the centre's neighbourhood and a panel about the
 * centre. `scope` null means still resolving: nothing is queried.
 */
export function GraphViewer({
  history,
  onNavigate,
  scope,
  overrides,
  topicName = null,
  close = null,
}: {
  /** Where the view is and how it got there; the caller keeps it (the URL, on the page). */
  history: GraphHistory;
  onNavigate: (next: GraphHistory) => void;
  scope: GraphScope | null;
  overrides?: GraphFilterOverrides;
  /** For copy only; the topic's id and space are in `scope`. */
  topicName?: string | null;
  /** Where the close button goes: the topic's page. */
  close?: { href: string; label: string } | null;
}) {
  const filter = React.useMemo(() => (scope ? resolveGraphFilter(scope, overrides) : null), [scope, overrides]);
  const [tab, setTab] = React.useState<EntityPanelTab>('details');
  const [kindFilter, setKindFilter] = React.useState<GraphKindFilter>('all');
  // Names of entities already seen, for "Back to X" and the trail before a hop is refetched.
  const [names, setNames] = React.useState<Record<string, string>>({});
  const phone = useMediaQuery(PHONE_QUERY);

  const centreId = history.centreId;
  const hubId = scope?.topicId ? normId(scope.topicId) : null;
  const topicSpaceId = scope?.topicSpaceId ? normId(scope.topicSpaceId) : null;
  const hop = useGraphHop(centreId, filter);
  const neighbourhood = useGraphNeighbourhood({
    centreId,
    filter,
    caps: phone ? PHONE_GRAPH_CAPS : DESKTOP_GRAPH_CAPS,
    kindFilter,
    hubId,
  });
  const claims = useClaimsAbout(centreId, filter, scope?.topicSpaceId ?? null);
  const claimPages = React.useMemo(() => claims.data?.pages.map(page => page.claims) ?? [], [claims.data]);
  const prefetch = usePrefetchGraphHop(filter);

  const hopData = hop.data ?? null;
  // The neighbourhood's relations once it answers for this centre, so the list matches the map.
  const hop1 = neighbourhood.isSwitching ? null : (neighbourhood.hop1.data ?? null);
  const spokes = React.useMemo(() => {
    if (!filter) return [];
    if (hop1?.centre?.id === centreId) return buildSpokes(hop1AsGraphHop(hop1), centreId, filter, true);
    return hopData ? buildSpokes(hopData, centreId, filter) : [];
  }, [centreId, filter, hop1, hopData]);

  React.useEffect(() => {
    const centreName = hopData?.centre?.name;
    if (!centreName) return;
    setNames(current => (current[centreId] === centreName ? current : { ...current, [centreId]: centreName }));
  }, [centreId, hopData]);

  const goTo = React.useCallback(
    (id: string, name: string | null) => {
      if (name) setNames(current => ({ ...current, [id]: name }));
      onNavigate(recentre(history, id));
    },
    [history, onNavigate]
  );
  const select = React.useCallback((spoke: Spoke) => goTo(spoke.entity.id, spoke.entity.name), [goTo]);
  const selectNode = React.useCallback(
    (node: GraphNode) => {
      // A chip that would hide the new centre gives way, as in the design.
      if (kindFilter !== 'all' && node.kind !== kindFilter && node.kind !== 'topic') setKindFilter('all');
      goTo(node.id, node.name);
    },
    [goTo, kindFilter]
  );

  const previousId = history.back.at(-1);
  // After a reload or on a shared link the previous hop was never seen here; the store knows its name.
  const { entity: previousEntity } = useQueryEntity({ id: previousId ?? '', enabled: Boolean(previousId) });
  const back = previousId
    ? {
        label: `Back to ${names[previousId] ?? previousEntity?.name ?? 'previous'}`,
        onClick: () => onNavigate(goBack(history)),
      }
    : null;
  const trail = [...history.back, centreId].flatMap(id => (names[id] ? [names[id]] : []));
  const selection = neighbourhood.selection;

  const topBar = (
    <GraphTopBar
      back={back}
      trail={trail.length ? trail : topicName ? [topicName] : []}
      search={<GraphSearch nodes={selection?.nodes.slice(1).map(entry => entry.node) ?? []} onPick={selectNode} />}
      kinds={neighbourhood.kinds}
      kindFilter={kindFilter}
      onKindFilter={setKindFilter}
      close={close}
    />
  );

  let stage: React.ReactNode;
  if (selection) {
    stage = (
      <ConnectionsStage
        selection={selection}
        phone={phone}
        topicSpaceId={topicSpaceId}
        onSelect={selectNode}
        onPrefetch={prefetch}
        emptyMessage={filter ? relationshipsEmptyMessage(filter) : ''}
      />
    );
  } else if (neighbourhood.hop1.isError) {
    stage = (
      <StageNote role="alert">
        Couldn’t load the connections.{' '}
        <button type="button" className="underline" onClick={() => void neighbourhood.hop1.refetch()}>
          Try again
        </button>
      </StageNote>
    );
  } else if (neighbourhood.hop1.data && !neighbourhood.centre) {
    stage = <StageNote role="status">This entity isn’t in the knowledge graph.</StageNote>;
  } else {
    stage = <StageNote aria-busy>Loading connections…</StageNote>;
  }

  return (
    <div className="flex h-full min-h-0 flex-col md:h-auto">
      {topBar}
      <div className="flex min-h-0 flex-1 md:flex-none md:flex-col">
        <div className="relative isolate min-w-0 flex-1 overflow-hidden bg-[#0b0b0c] md:h-[62vh] md:min-h-[400px] md:flex-none">
          {stage}
        </div>
        <aside className="w-[360px] shrink-0 overflow-y-auto border-l border-[#f0f0f0] bg-white p-6 md:w-auto md:overflow-visible md:border-t md:border-l-0 md:p-4">
          {renderPanel()}
        </aside>
      </div>
    </div>
  );

  function renderPanel() {
    if (filter && hop.isError && !hopData) {
      return (
        <div className="flex flex-col items-start gap-2" role="alert">
          <p className="text-body text-text">Couldn’t load this part of the graph.</p>
          <button type="button" className="text-metadataMedium underline" onClick={() => void hop.refetch()}>
            Try again
          </button>
        </div>
      );
    }
    if (!filter || !hopData) {
      return (
        <div className="flex flex-col gap-3" aria-busy>
          <Skeleton className="h-12 w-full rounded-lg" />
          <Skeleton className="h-[200px] w-full rounded-lg" />
        </div>
      );
    }
    const rawCentre = hopData.centre;
    if (!rawCentre) {
      return (
        <p role="status" className="text-body text-text">
          This entity isn’t in the knowledge graph.
        </p>
      );
    }

    const centreSpaceId =
      (topicSpaceId && hubId && rawCentre.id === hubId ? topicSpaceId : null) ??
      entitySpaceId(rawCentre, filter.spaceIds, null);
    const centre = { ...rawCentre, ...centreTextInSpace(rawCentre, centreSpaceId) };
    // The neighbourhood answers for the centre once it has landed; before that it is the last one.
    const node = !neighbourhood.isSwitching && neighbourhood.centre?.id === centreId ? neighbourhood.centre : null;
    const claimSpaceId = node?.kind === 'claim' ? nodeClaimSpaceId(node, topicSpaceId) : null;

    let summary: React.ReactNode = null;
    if (claimSpaceId) summary = <ClaimActions claimId={centreId} spaceId={claimSpaceId} />;
    else if (centreId === hubId)
      summary = <TopicClaimsSummary topicId={centreId} spaceId={topicSpaceId} onOpenClaim={id => goTo(id, null)} />;
    const counts =
      node && neighbourhood.hop1.data ? (
        <KindCounts neighbours={neighbourhood.hop1.data.neighbours} moreKinds={neighbourhood.hop1.data.moreKinds} />
      ) : null;

    return (
      <EntityPanel
        centre={centre}
        centreSpaceId={centreSpaceId}
        spokes={spokes}
        claimPages={claimPages}
        claimsState={{
          isLoading: claims.isLoading,
          isError: claims.isError,
          hasNextPage: claims.hasNextPage,
          isFetchingNextPage: claims.isFetchingNextPage,
          fetchNextPage: () => void claims.fetchNextPage(),
        }}
        tab={tab}
        onTabChange={setTab}
        onSelect={select}
        truncated={hop1?.centre?.id === centreId ? false : hopData.truncated}
        emptyMessages={{
          relationships: relationshipsEmptyMessage(filter),
          claims: claimsEmptyMessage(filter, topicName),
          description: descriptionEmptyMessage(centreSpaceId),
        }}
        showClaims={graphKindOf(rawCentre.types.map(type => type.id)) !== 'claim'}
        summary={
          summary || counts ? (
            <>
              {summary}
              {counts}
            </>
          ) : null
        }
      />
    );
  }
}

function StageNote({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div {...props} className="flex h-full min-h-[300px] items-center justify-center p-6 text-[14px] text-[#e6e6e6]">
      <p>{children}</p>
    </div>
  );
}
