'use client';

import { IdUtils } from '@geoprotocol/geo-sdk/lite';

import * as React from 'react';

import { usePathname, useSearchParams } from 'next/navigation';

import { parseGraphFilterOverrides } from '~/core/graph-explorer/graph-filter';
import { historyFromUrl } from '~/core/graph-explorer/history';
import { entitySpaceId, namedSpaceIds } from '~/core/graph-explorer/spokes';
import { useTopicGraphScope } from '~/core/graph-explorer/use-graph-explorer';
import { useGraphNavigation } from '~/core/graph-explorer/use-graph-navigation';
import { useHydrated } from '~/core/hooks/use-hydrated';
import { useQueryEntity } from '~/core/sync/use-store';
import { useTopicSpaceScope } from '~/core/topics/use-topic-space-scope';
import { normId } from '~/core/utils/norm-id';
import { NavUtils } from '~/core/utils/utils';

import { PrefetchLink as Link } from '~/design-system/prefetch-link';

import { GraphViewer } from './graph-viewer';

/**
 * Full-screen shell under the app navbar (which keeps search and Log in), over the sidebar and page
 * chrome. Desktop scrolls the panel only; narrower screens scroll the whole view.
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

  return (
    <div className="fixed inset-x-0 top-[44px] bottom-0 z-50 flex flex-col overflow-hidden bg-white lg:overflow-y-auto">
      {!hydrated ? null : topicId ? (
        <TopicGraph
          entityId={entityId}
          topicId={topicId}
          routeSpaceId={routeSpaceId}
          overrides={overrides}
          searchKey={searchKey}
        />
      ) : (
        <GlobalNotAvailable />
      )}
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
      <header className="flex shrink-0 items-center gap-3 border-b border-grey-02 px-6 py-3 lg:px-4">
        {topicSpaceId ? (
          <Link
            href={NavUtils.toEntity(topicSpaceId, topicId)}
            className="text-metadataMedium text-grey-04 transition-colors hover:text-text"
          >
            ← {topic?.name ?? 'Topic'}
          </Link>
        ) : (
          <span className="text-metadataMedium text-grey-04">{topic?.name ?? 'Topic'}</span>
        )}
        <span aria-hidden className="text-grey-03">
          ·
        </span>
        <h1 className="text-metadataMedium text-text">Graph explorer</h1>
      </header>
      <div className="min-h-0 flex-1 px-6 py-6 lg:px-4 lg:py-4">
        <GraphViewer
          history={history}
          onNavigate={navigate}
          scope={scope}
          overrides={overrides}
          topicName={topic?.name ?? null}
        />
      </div>
    </>
  );
}

function GlobalNotAvailable() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
      <h1 className="text-mediumTitle text-text">Not available yet</h1>
      <p className="max-w-[420px] text-body text-grey-04">
        The graph explorer opens from a topic for now. Open a topic and choose Explore graph.
      </p>
      <Link href="/explore" className="text-metadataMedium text-text underline-offset-2 hover:underline">
        Go to Explore
      </Link>
    </div>
  );
}
