'use client';

import { IdUtils } from '@geoprotocol/geo-sdk/lite';

import * as React from 'react';

import { useSetAtom } from 'jotai';
import { usePathname, useSearchParams } from 'next/navigation';

import { parseGraphFilterOverrides } from '~/core/graph-explorer/graph-filter';
import { historyFromUrl } from '~/core/graph-explorer/history';
import { entitySpaceId, namedSpaceIds } from '~/core/graph-explorer/spokes';
import { useTopicGraphScope } from '~/core/graph-explorer/use-graph-explorer';
import { useGraphNavigation } from '~/core/graph-explorer/use-graph-navigation';
import { useHydrated } from '~/core/hooks/use-hydrated';
import { useFeatureFlag } from '~/core/state/feature-flags';
import { useQueryEntity } from '~/core/sync/use-store';
import { useTopicSpaceScope } from '~/core/topics/use-topic-space-scope';
import { normId } from '~/core/utils/norm-id';
import { NavUtils } from '~/core/utils/utils';

import { PrefetchLink as Link } from '~/design-system/prefetch-link';

import { GraphViewer } from './graph-viewer';
import { graphExplorerActiveAtom } from '~/atoms';

/**
 * Full-screen while mounted: the app drops its navbar and sidebar, so the explorer sits in flow and
 * body portals open over it. Desktop scrolls the panel only; narrower screens scroll the whole view.
 */
export function GraphExplorerPage({ entityId: routeEntityId }: { entityId: string }) {
  const searchParams = useSearchParams();
  // Hops change the path with the history API, which leaves the route's own param on the first centre.
  const pathCentre = usePathname()?.split('/').at(-1);
  const entityId = pathCentre && IdUtils.isValid(pathCentre) ? normId(pathCentre) : routeEntityId;
  const topicParam = searchParams.get('topic');
  const topicId = topicParam && IdUtils.isValid(topicParam) ? normId(topicParam) : null;
  const spaceParam = searchParams.get('space');
  const routeSpaceId = spaceParam && IdUtils.isValid(spaceParam) ? normId(spaceParam) : null;
  const searchKey = searchParams.toString();
  // Keyed on the string so a new URLSearchParams object with the same contents keeps the filter stable.
  const overrides = React.useMemo(() => parseGraphFilterOverrides(new URLSearchParams(searchKey)), [searchKey]);
  // Everything below reads client stores (entity store, viewer's spaces), so it renders after hydration.
  const hydrated = useHydrated();

  // A soft gate: flags live in localStorage.
  const enabled = useFeatureFlag('graphExplorer');
  const shows = hydrated && enabled && topicId !== null;
  const setActive = useSetAtom(graphExplorerActiveAtom);
  React.useLayoutEffect(() => {
    if (!shows) return;
    setActive(true);
    return () => setActive(false);
  }, [setActive, shows]);

  if (!hydrated) return null;
  if (!shows) return <NotAvailable flagOff={!enabled} />;
  return (
    <div className="flex h-[100dvh] flex-col overflow-hidden bg-white md:h-auto md:min-h-[100dvh] md:overflow-visible">
      <TopicGraph
        entityId={entityId}
        topicId={topicId}
        routeSpaceId={routeSpaceId}
        overrides={overrides}
        searchKey={searchKey}
      />
    </div>
  );
}

function TopicGraph({
  entityId,
  topicId,
  routeSpaceId,
  overrides,
  searchKey,
}: {
  entityId: string;
  topicId: string;
  routeSpaceId: string | null;
  overrides: ReturnType<typeof parseGraphFilterOverrides>;
  searchKey: string;
}) {
  const params = React.useMemo(() => new URLSearchParams(searchKey), [searchKey]);
  const history = React.useMemo(() => historyFromUrl(entityId, params), [entityId, params]);
  const navigate = useGraphNavigation(history, params);
  const topicSpaces = useTopicSpaceScope(routeSpaceId);
  const { entity: topic } = useQueryEntity({ id: topicId, spaceId: routeSpaceId ?? undefined });
  const topicSpaceId =
    routeSpaceId ??
    (topic
      ? entitySpaceId(
          { spaceIds: topic.spaces ?? [], namedSpaceIds: namedSpaceIds(topic.values ?? []) },
          topicSpaces,
          null
        )
      : null);
  const scope = useTopicGraphScope(routeSpaceId, topicId, topicSpaceId);

  return (
    <>
      <h1 className="sr-only">Graph explorer{topic?.name ? `: ${topic.name}` : ''}</h1>
      <GraphViewer
        history={history}
        onNavigate={navigate}
        scope={scope}
        overrides={overrides}
        topicName={topic?.name ?? null}
        close={
          topicSpaceId
            ? {
                href: NavUtils.toEntity(topicSpaceId, topicId),
                label: `Close the map and go to ${topic?.name ?? 'the topic'}`,
              }
            : null
        }
      />
    </>
  );
}

function NotAvailable({ flagOff }: { flagOff: boolean }) {
  return (
    <div className="flex min-h-[60vh] flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
      <h1 className="text-mediumTitle text-text">Not available yet</h1>
      <p className="max-w-[420px] text-body text-grey-04">
        {flagOff
          ? 'The graph explorer isn’t open to everyone yet.'
          : 'The graph explorer opens from a topic for now. Open a topic and choose Explore graph.'}
      </p>
      <Link href="/explore" className="text-metadataMedium text-text underline-offset-2 hover:underline">
        Go to Explore
      </Link>
    </div>
  );
}
