'use client';

import * as React from 'react';

import { centreTextInSpace } from '~/core/graph-explorer/centre-text';
import type { GraphNode } from '~/core/graph-explorer/fetch-graph-neighbourhood';
import { type GraphFilterOverrides, type GraphScope, resolveGraphFilter } from '~/core/graph-explorer/graph-filter';
import { type GraphHistory, goBack, recentre } from '~/core/graph-explorer/history';
import { type Spoke, buildSpokes, entitySpaceId } from '~/core/graph-explorer/spokes';
import { useClaimsAbout, useGraphHop, usePrefetchGraphHop } from '~/core/graph-explorer/use-graph-explorer';
import { useQueryEntity } from '~/core/sync/use-store';
import { normId } from '~/core/utils/norm-id';

import { Skeleton } from '~/design-system/skeleton';

import { ConnectionsView } from './connections/connections-view';
import { claimsEmptyMessage, descriptionEmptyMessage, relationshipsEmptyMessage } from './empty-states';
import { EntityPanel, type EntityPanelTab } from './entity-panel';

/** Hub-and-spoke view of an entity's relations. `scope` null means still resolving: nothing is queried. */
export function GraphViewer({
  history,
  onNavigate,
  scope,
  overrides,
  topicName = null,
}: {
  /** Where the view is and how it got there; the caller keeps it (the URL, on the page). */
  history: GraphHistory;
  onNavigate: (next: GraphHistory) => void;
  scope: GraphScope | null;
  overrides?: GraphFilterOverrides;
  /** For copy only; the topic's id and space are in `scope`. */
  topicName?: string | null;
}) {
  const filter = React.useMemo(() => (scope ? resolveGraphFilter(scope, overrides) : null), [scope, overrides]);
  const [tab, setTab] = React.useState<EntityPanelTab>('details');
  // Names of entities already seen, for "Back to X" before the previous hop is refetched.
  const [names, setNames] = React.useState<Record<string, string>>({});

  const centreId = history.centreId;
  const hop = useGraphHop(centreId, filter);
  const claims = useClaimsAbout(centreId, filter, scope?.topicSpaceId ?? null);
  const claimPages = React.useMemo(() => claims.data?.pages.map(page => page.claims) ?? [], [claims.data]);
  const prefetch = usePrefetchGraphHop(filter);

  const hopData = hop.data ?? null;
  const spokes = React.useMemo(
    () => (hopData && filter ? buildSpokes(hopData, centreId, filter) : []),
    [centreId, filter, hopData]
  );

  React.useEffect(() => {
    const centreName = hopData?.centre?.name;
    if (!centreName) return;
    setNames(current => (current[centreId] === centreName ? current : { ...current, [centreId]: centreName }));
  }, [centreId, hopData]);

  const select = React.useCallback(
    (spoke: Spoke) => {
      if (spoke.entity.name) setNames(current => ({ ...current, [spoke.entity.id]: spoke.entity.name! }));
      onNavigate(recentre(history, spoke.entity.id));
    },
    [history, onNavigate]
  );

  const selectNode = React.useCallback(
    (node: GraphNode) => {
      if (node.name) setNames(current => ({ ...current, [node.id]: node.name! }));
      onNavigate(recentre(history, node.id));
    },
    [history, onNavigate]
  );

  const previousId = history.back.at(-1);
  // After a reload or on a shared link the previous hop was never seen here; the store knows its name.
  const { entity: previousEntity } = useQueryEntity({ id: previousId ?? '', enabled: Boolean(previousId) });
  const backButton = previousId ? (
    <button
      type="button"
      className="self-start text-metadataMedium text-text underline-offset-2 hover:underline"
      onClick={() => onNavigate(goBack(history))}
    >
      <span aria-hidden>← </span>Back to {names[previousId] ?? previousEntity?.name ?? 'previous'}
    </button>
  ) : null;

  if (filter && hop.isError && !hopData) {
    return (
      <div className="flex flex-col items-start gap-2 p-4" role="alert">
        {backButton}
        <p className="text-body text-text">Couldn’t load this part of the graph.</p>
        <button type="button" className="text-metadataMedium underline" onClick={() => void hop.refetch()}>
          Try again
        </button>
      </div>
    );
  }

  if (!filter || !hopData) {
    return (
      <div className="grid h-full grid-cols-[minmax(0,1fr)_400px] gap-6 lg:h-auto lg:grid-cols-1" aria-busy>
        <Skeleton className="min-h-[300px] w-full rounded-lg" />
        <Skeleton className="h-[240px] w-full rounded-lg" />
      </div>
    );
  }

  const rawCentre = hopData.centre;
  if (!rawCentre) {
    return (
      <div className="flex flex-col items-start gap-2 p-4" role="status">
        {backButton}
        <p className="text-body text-text">This entity isn’t in the knowledge graph.</p>
      </div>
    );
  }

  const centreSpaceId =
    (scope?.topicSpaceId && scope.topicId && rawCentre.id === normId(scope.topicId)
      ? normId(scope.topicSpaceId)
      : null) ?? entitySpaceId(rawCentre, filter.spaceIds, null);
  const centre = { ...rawCentre, ...centreTextInSpace(rawCentre, centreSpaceId) };
  const emptyMessages = {
    relationships: relationshipsEmptyMessage(filter),
    claims: claimsEmptyMessage(filter, topicName),
    description: descriptionEmptyMessage(centreSpaceId),
  };

  return (
    <div className="grid h-full min-h-0 grid-cols-[minmax(0,1fr)_400px] gap-6 lg:h-auto lg:grid-cols-1 lg:gap-4">
      <div className="flex min-h-0 flex-col gap-2">
        {backButton}
        <div className="min-h-[420px] flex-1 overflow-hidden rounded-lg lg:h-[62vh] lg:min-h-[400px] lg:flex-none">
          <ConnectionsView
            centreId={centreId}
            filter={filter}
            hubId={scope?.topicId ? normId(scope.topicId) : null}
            topicSpaceId={scope?.topicSpaceId ?? null}
            onSelect={selectNode}
            onPrefetch={prefetch}
            emptyMessage={emptyMessages.relationships}
          />
        </div>
      </div>
      <div className="min-h-0 overflow-y-auto pr-1 lg:overflow-visible lg:pr-0">
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
          truncated={hopData.truncated}
          emptyMessages={emptyMessages}
        />
      </div>
    </div>
  );
}
