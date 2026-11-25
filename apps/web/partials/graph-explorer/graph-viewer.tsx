'use client';

import * as React from 'react';

import { useActionContext } from '~/core/action-context-provider';
import { centreTextInSpace } from '~/core/graph-explorer/centre-text';
import { type ClaimAbout, nodeClaimSpaceId } from '~/core/graph-explorer/claims-about';
import { type GraphNode, hop1AsGraphHop } from '~/core/graph-explorer/fetch-graph-neighbourhood';
import { type RecentreMethod, useGraphAnalytics } from '~/core/graph-explorer/graph-explorer-analytics';
import { type GraphFilterOverrides, type GraphScope, resolveGraphFilter } from '~/core/graph-explorer/graph-filter';
import { shareGraph } from '~/core/graph-explorer/graph-share';
import { type GraphHistory, goBack, jumpBack, recentre } from '~/core/graph-explorer/history';
import { spokesOfKind } from '~/core/graph-explorer/panel-sections';
import { GRAPH_PHONE_QUERY } from '~/core/graph-explorer/phone-breakpoint';
import { DESKTOP_GRAPH_CAPS, type GraphKindFilter, PHONE_GRAPH_CAPS } from '~/core/graph-explorer/select-graph';
import { SKELETON_SELECTION } from '~/core/graph-explorer/skeleton-graph';
import { buildSpokes, entitySpaceId } from '~/core/graph-explorer/spokes';
import { useClaimsAbout, useGraphNeighbourhood, usePrefetchHop1 } from '~/core/graph-explorer/use-graph-explorer';
import { useMediaQuery } from '~/core/hooks/use-media-query';
import { isHiddenEntity } from '~/core/moderation/hidden';
import { useQueryEntity } from '~/core/sync/use-store';
import { normId } from '~/core/utils/norm-id';

import { Skeleton } from '~/design-system/skeleton';

import { ClaimActions, TopicClaimsSummary } from './connections/centre-summary';
import { ConnectionsStage } from './connections/connections-view';
import { GraphSearch } from './connections/graph-search';
import { GraphTopBar } from './connections/graph-top-bar';
import { claimsEmptyMessage, descriptionEmptyMessage, relationshipsEmptyMessage } from './empty-states';
import { EntityPanel, NO_CLAIMS_ASKED } from './entity-panel';
import { TopicOverview } from './panel-sections';
import { PhonePanelSheet } from './phone-panel-sheet';

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
  // A shared link opens on the chip it was shared with.
  const [kindFilter, setKindFilter] = React.useState<GraphKindFilter>(() => overrides?.chip ?? 'all');
  // Names of entities already seen, for "Back to X" and the trail before a hop is refetched.
  const [names, setNames] = React.useState<Record<string, string>>({});
  const phone = useMediaQuery(GRAPH_PHONE_QUERY);
  const analytics = useGraphAnalytics();

  const centreId = history.centreId;
  const hubId = scope?.topicId ? normId(scope.topicId) : null;
  const topicSpaceId = scope?.topicSpaceId ? normId(scope.topicSpaceId) : null;
  const neighbourhood = useGraphNeighbourhood({
    centreId,
    filter,
    caps: phone ? PHONE_GRAPH_CAPS : DESKTOP_GRAPH_CAPS,
    kindFilter,
    hubId,
  });
  const claims = useClaimsAbout(centreId, filter, scope?.topicSpaceId ?? null);
  const claimPages = React.useMemo(() => claims.data?.pages.map(page => page.claims) ?? [], [claims.data]);
  const prefetch = usePrefetchHop1(filter);
  const getShareContext = useActionContext('share_dialog', 'graph', centreId);
  const share = React.useMemo(
    () =>
      hubId
        ? {
            native: phone,
            onShare: () =>
              shareGraph({ entityId: centreId, topicId: hubId, spaceId: topicSpaceId }, getShareContext(), {
                nativeShare: phone,
                kindFilter,
              }),
          }
        : null,
    [centreId, getShareContext, hubId, kindFilter, phone, topicSpaceId]
  );

  // Hop 1 once it answers for this centre: the panel, its list and the map read the same data.
  const hop1 = neighbourhood.isSwitching ? null : (neighbourhood.hop1.data ?? null);
  const spokes = React.useMemo(
    () =>
      filter && hop1?.centre?.id === centreId ? buildSpokes(hop1AsGraphHop(hop1), centreId, filter, topicSpaceId) : [],
    [centreId, filter, hop1, topicSpaceId]
  );

  const hop1Nodes = React.useMemo(
    () => new Map(hop1?.centre?.id === centreId ? hop1.neighbours.map(({ node }) => [normId(node.id), node]) : []),
    [centreId, hop1]
  );
  const panelSpokes = React.useMemo(() => spokesOfKind(spokes, hop1Nodes, kindFilter), [spokes, hop1Nodes, kindFilter]);
  // The panel's "first N of each kind" note counts only the kinds the chip leaves in it.
  const panelMoreKinds = React.useMemo(() => {
    const more = hop1?.moreKinds ?? [];
    return kindFilter === 'all' ? more : more.filter(kind => kind === kindFilter);
  }, [hop1, kindFilter]);
  // Dated news can come from hop 1 or from the map's second ring.
  const loadedNodes = React.useMemo(
    () => [...hop1Nodes.values(), ...(neighbourhood.selection?.nodes.map(entry => entry.node) ?? [])],
    [hop1Nodes, neighbourhood.selection]
  );

  // After the URL changed, so the event carries the new centre's page view.
  const trailDepth = history.back.length;
  React.useEffect(() => {
    analytics?.recentred(centreId, { trailDepth, kindFilter });
    // A kind change is not a hop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [analytics, centreId, trailDepth]);

  const settled: { outcome: 'ready' | 'error' | 'not_in_graph'; kind?: GraphNode['kind'] } | null =
    neighbourhood.hop1.isError && !hop1
      ? { outcome: 'error' }
      : hop1?.centre?.id === centreId && neighbourhood.selection
        ? { outcome: 'ready', kind: hop1.centre.kind }
        : hop1 && !hop1.centre
          ? { outcome: 'not_in_graph' }
          : null;
  React.useEffect(() => {
    if (settled)
      analytics?.opened(settled.outcome, {
        entityKind: settled.kind,
        layout: phone ? 'phone' : 'desktop',
        trailDepth,
      });
  }, [analytics, phone, settled?.kind, settled?.outcome, trailDepth]); // eslint-disable-line react-hooks/exhaustive-deps

  React.useEffect(() => {
    const centreName = hop1?.centre?.id === centreId ? hop1.centre.name : null;
    if (!centreName) return;
    setNames(current => (current[centreId] === centreName ? current : { ...current, [centreId]: centreName }));
  }, [centreId, hop1]);

  const goTo = React.useCallback(
    (id: string, name: string | null, method: RecentreMethod = 'panel', kind?: GraphNode['kind']) => {
      if (name) setNames(current => ({ ...current, [id]: name }));
      analytics?.tag(method, normId(id), kind);
      onNavigate(recentre(history, id));
    },
    [analytics, history, onNavigate]
  );
  // A chip that would hide the new centre gives way, as in the design.
  const giveWayFor = React.useCallback(
    (kind: GraphNode['kind']) => {
      if (kindFilter !== 'all' && kind !== kindFilter) setKindFilter('all');
    },
    [kindFilter]
  );
  const selectNode = React.useCallback(
    (node: GraphNode, method: RecentreMethod = 'node') => {
      giveWayFor(node.kind);
      goTo(node.id, node.name, method, node.kind);
    },
    [giveWayFor, goTo]
  );
  // The topic summary keeps its claim rows under any chip, so opening one gives way like a map tap.
  // (Its People and Latest news rows, the only other ones, show under Everything alone.)
  const openClaim = React.useCallback(
    (id: string, name: string | null, method: RecentreMethod = 'panel') => {
      giveWayFor('claim');
      goTo(id, name, method);
    },
    [giveWayFor, goTo]
  );
  const pickKind = React.useCallback(
    (next: GraphKindFilter) => {
      if (next === kindFilter) return;
      setKindFilter(next);
      analytics?.interacted({ interaction: 'filter', value: next });
    },
    [analytics, kindFilter]
  );

  const previousId = history.back.at(-1);
  // After a reload or on a shared link the previous hop was never seen here; the store knows its name.
  const { entity: previousEntity } = useQueryEntity({ id: previousId ?? '', enabled: Boolean(previousId) });
  const back = previousId
    ? {
        label: `Back to ${names[previousId] ?? (isHiddenEntity(previousEntity) ? null : previousEntity?.name) ?? 'previous'}`,
        onClick: () => {
          analytics?.tag('back', normId(previousId));
          onNavigate(goBack(history));
        },
      }
    : null;
  // Each step keeps its place in the back stack, so a step whose name isn't known yet can drop out
  // of the path without the others jumping to the wrong centre.
  const trail = [...history.back, centreId].flatMap((id, index) => (names[id] ? [{ name: names[id], index }] : []));
  const jumpTo = (index: number) => {
    const target = history.back[index];
    if (!target) return;
    analytics?.tag('trail', normId(target));
    onNavigate(jumpBack(history, index));
  };
  const selection = neighbourhood.selection;

  const topBar = (
    <GraphTopBar
      back={back}
      trail={trail.length ? trail : topicName ? [{ name: topicName, index: history.back.length }] : []}
      onStep={jumpTo}
      search={
        <GraphSearch
          nodes={selection?.nodes.slice(1).map(entry => entry.node) ?? []}
          onPick={node => selectNode(node, 'search')}
          onSearched={resultCount => analytics?.interacted({ interaction: 'search', result_count: resultCount })}
        />
      }
      kinds={neighbourhood.kinds}
      kindFilter={kindFilter}
      onKindFilter={pickKind}
      share={share}
      close={close}
    />
  );

  // While nothing is loaded the same stage draws a skeleton, so the real graph eases in from it.
  let stage: React.ReactNode;
  if (selection || (!neighbourhood.hop1.isError && !(neighbourhood.hop1.data && !neighbourhood.centre))) {
    stage = (
      <ConnectionsStage
        selection={selection ?? SKELETON_SELECTION[phone ? 'phone' : 'desktop']}
        phone={phone}
        topicSpaceId={topicSpaceId}
        onSelect={node => selectNode(node)}
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
  } else {
    stage = <StageNote role="status">This entity isn’t in the knowledge graph.</StageNote>;
  }

  // On a phone the map takes the screen below the top bar and the panel is a sheet over it (GEO-3849).
  // `graph-phone:` sorts after `md:`, so it undoes the stacked md: layout under 600px only.
  return (
    <div className="flex h-full min-h-0 flex-col md:h-auto graph-phone:h-full">
      {topBar}
      <div className="flex min-h-0 flex-1 md:flex-none md:flex-col graph-phone:flex-1">
        {/* Tablet: the 76px the two-row top bar gave up (GEO-3849), so the panel still starts where
            it did and its top still peeks above the fold for scrolling past the map. */}
        <div
          data-testid="graph-map"
          className="relative isolate min-w-0 flex-1 overflow-hidden bg-[#0b0b0c] md:h-[calc(62vh+76px)] md:min-h-[400px] md:flex-none graph-phone:h-auto graph-phone:min-h-0 graph-phone:flex-1"
        >
          {stage}
          {phone ? (
            <PhonePanelSheet
              centreId={centreId}
              centreName={hop1?.centre?.id === centreId ? hop1.centre.name : (names[centreId] ?? null)}
            >
              {renderPanel()}
            </PhonePanelSheet>
          ) : null}
        </div>
        {phone ? null : (
          <aside className="w-[360px] shrink-0 overflow-y-auto border-l border-[#f0f0f0] bg-white p-6 md:w-auto md:overflow-visible md:border-t md:border-l-0 md:p-4">
            {renderPanel()}
          </aside>
        )}
      </div>
    </div>
  );

  function renderPanel() {
    if (filter && neighbourhood.hop1.isError && !hop1) {
      return (
        <div className="flex flex-col items-start gap-2" role="alert">
          <p className="text-body text-text">Couldn’t load this part of the graph.</p>
          <button
            type="button"
            className="text-metadataMedium underline"
            onClick={() => void neighbourhood.hop1.refetch()}
          >
            Try again
          </button>
        </div>
      );
    }
    if (!filter || !hop1) {
      return (
        <div className="flex flex-col gap-3" aria-busy>
          <Skeleton className="h-12 w-full rounded-lg" />
          <Skeleton className="h-[200px] w-full rounded-lg" />
        </div>
      );
    }
    const rawCentre = hop1.centre;
    if (!rawCentre) {
      return (
        <p role="status" className="text-body text-text">
          This entity isn’t in the knowledge graph.
        </p>
      );
    }

    const centreSpaceId =
      (topicSpaceId && hubId && rawCentre.id === hubId ? topicSpaceId : null) ??
      entitySpaceId(rawCentre, filter.spaceIds, null, topicSpaceId);
    const centre = { ...rawCentre, ...centreTextInSpace(rawCentre, centreSpaceId) };
    const node = rawCentre;
    const claimSpaceId = node.kind === 'claim' ? nodeClaimSpaceId(node, topicSpaceId) : null;

    // The panel follows the chip as the map does: only that kind's group, and claims only under Claims.
    const chipped = kindFilter !== 'all';
    const showsClaims = !chipped || kindFilter === 'claim';

    let summary: React.ReactNode = null;
    if (claimSpaceId) summary = <ClaimActions claimId={centreId} spaceId={claimSpaceId} />;
    else if (centreId === hubId)
      summary = (
        <>
          <TopicClaimsSummary
            topicId={centreId}
            filter={filter}
            topicSpaceId={topicSpaceId}
            onOpenClaim={id => openClaim(id, null, 'summary')}
          />
          <TopicOverview
            topicId={centreId}
            filter={filter}
            topicSpaceId={topicSpaceId}
            // Its People and Latest news lists are other kinds: under a chip they stay hidden.
            selection={chipped ? null : selection}
            nodes={chipped ? NO_NODES : loadedNodes}
            onOpen={openClaim}
          />
        </>
      );

    return (
      <EntityPanel
        centre={centre}
        centreSpaceId={centreSpaceId}
        topicSpaceId={topicSpaceId}
        spokes={panelSpokes}
        nodes={hop1Nodes}
        claimPages={showsClaims ? claimPages : NO_CLAIM_PAGES}
        claimsState={
          showsClaims
            ? {
                isLoading: claims.isLoading,
                isError: claims.isError,
                hasNextPage: claims.hasNextPage,
                isFetchingNextPage: claims.isFetchingNextPage,
                fetchNextPage: () => void claims.fetchNextPage(),
              }
            : NO_CLAIMS_ASKED
        }
        onOpen={goTo}
        moreKinds={panelMoreKinds}
        emptyMessages={{
          relationships: relationshipsEmptyMessage(filter),
          claims: showsClaims ? claimsEmptyMessage(filter, topicName) : null,
          description: descriptionEmptyMessage(centreSpaceId),
        }}
        showClaims={rawCentre.kind !== 'claim'}
        summary={summary}
      />
    );
  }
}

const NO_NODES: GraphNode[] = [];
const NO_CLAIM_PAGES: ClaimAbout[][] = [];

function StageNote({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div {...props} className="flex h-full min-h-[300px] items-center justify-center p-6 text-[14px] text-[#e6e6e6]">
      <p>{children}</p>
    </div>
  );
}
