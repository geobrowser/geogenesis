'use client';

import * as React from 'react';

import { centreTextInSpace } from '~/core/graph-explorer/centre-text';
import { type GraphFilterOverrides, type GraphScope, resolveGraphFilter } from '~/core/graph-explorer/graph-filter';
import { type GraphHistory, goBack, recentre, startGraphHistory } from '~/core/graph-explorer/history';
import {
  SPOKE_CAP_DESKTOP,
  SPOKE_CAP_PHONE,
  type Spoke,
  buildSpokes,
  entitySpaceId,
} from '~/core/graph-explorer/spokes';
import { useClaimsAbout, useGraphHop, usePrefetchGraphHop } from '~/core/graph-explorer/use-graph-explorer';
import { useIsMobileLayout } from '~/core/hooks/use-is-mobile-layout';
import { normId } from '~/core/utils/norm-id';

import { Skeleton } from '~/design-system/skeleton';

import { claimsEmptyMessage, descriptionEmptyMessage, relationshipsEmptyMessage } from './empty-states';
import { EntityPanel, type EntityPanelTab } from './entity-panel';
import { GraphCanvas } from './graph-canvas';

/** Hub-and-spoke view of an entity's relations. `scope` null means still resolving: nothing is queried. */
export function GraphViewer({
  startEntityId,
  scope,
  overrides,
  topic,
}: {
  startEntityId: string;
  scope: GraphScope | null;
  overrides?: GraphFilterOverrides;
  /** The topic the view opened from. `spaceId` is the space its topic page reads it in. */
  topic?: { id: string; name: string | null; spaceId: string | null };
}) {
  const filter = React.useMemo(() => (scope ? resolveGraphFilter(scope, overrides) : null), [scope, overrides]);
  const [history, setHistory] = React.useState<GraphHistory>(() => startGraphHistory(startEntityId));
  const [tab, setTab] = React.useState<EntityPanelTab>('details');
  // Names of entities already seen, for "Back to X" before the previous hop is refetched.
  const [names, setNames] = React.useState<Record<string, string>>({});

  React.useEffect(() => setHistory(startGraphHistory(startEntityId)), [startEntityId]);

  const centreId = history.centreId;
  const hop = useGraphHop(centreId, filter);
  const claims = useClaimsAbout(centreId, filter, topic?.spaceId ?? null);
  const prefetch = usePrefetchGraphHop(filter);
  const isMobile = useIsMobileLayout();

  const hopData = hop.data ?? null;
  const spokes = React.useMemo(
    () => (hopData && filter ? buildSpokes(hopData, centreId, filter) : []),
    [centreId, filter, hopData]
  );
  const cap = isMobile ? SPOKE_CAP_PHONE : SPOKE_CAP_DESKTOP;
  const shown = spokes.slice(0, cap);

  React.useEffect(() => {
    const centreName = hopData?.centre?.name;
    if (!centreName) return;
    setNames(current => (current[centreId] === centreName ? current : { ...current, [centreId]: centreName }));
  }, [centreId, hopData]);

  const select = React.useCallback((spoke: Spoke) => {
    if (spoke.entity.name) setNames(current => ({ ...current, [spoke.entity.id]: spoke.entity.name! }));
    setHistory(current => recentre(current, spoke.entity.id));
  }, []);

  const previousId = history.back.at(-1);
  const backButton = previousId ? (
    <button
      type="button"
      className="self-start text-metadataMedium text-text underline-offset-2 hover:underline"
      onClick={() => setHistory(current => goBack(current))}
    >
      <span aria-hidden>← </span>Back to {names[previousId] ?? 'previous'}
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
    (topic?.spaceId && rawCentre.id === normId(topic.id) ? normId(topic.spaceId) : null) ??
    entitySpaceId(rawCentre, filter.spaceIds, null);
  const centre = { ...rawCentre, ...centreTextInSpace(rawCentre, centreSpaceId) };
  const emptyMessages = {
    relationships: relationshipsEmptyMessage(filter),
    claims: claimsEmptyMessage(filter, topic?.name ?? null),
    description: descriptionEmptyMessage(centreSpaceId),
  };
  const claimList = claims.data?.pages.flatMap(page => page.claims) ?? [];

  return (
    <div className="grid h-full min-h-0 grid-cols-[minmax(0,1fr)_400px] gap-6 lg:h-auto lg:grid-cols-1 lg:gap-4">
      <div className="flex min-h-0 flex-col gap-2">
        {backButton}
        <div className="min-h-[420px] flex-1 rounded-lg border border-grey-02 lg:h-[440px] lg:min-h-0 lg:flex-none">
          <GraphCanvas
            centre={centre}
            spokes={shown}
            onSelect={select}
            onPrefetch={prefetch}
            emptyMessage={spokes.length === 0 ? emptyMessages.relationships : null}
          />
        </div>
        {spokes.length > shown.length && (
          <button
            type="button"
            className="self-start text-metadata text-grey-04 hover:text-text"
            onClick={() => setTab('relationships')}
          >
            +{spokes.length - shown.length} more in Relationships
          </button>
        )}
      </div>
      <div className="min-h-0 overflow-y-auto pr-1 lg:overflow-visible lg:pr-0">
        <EntityPanel
          centre={centre}
          centreSpaceId={centreSpaceId}
          spokes={spokes}
          claims={claimList}
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
