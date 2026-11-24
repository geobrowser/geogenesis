import { IdUtils } from '@geoprotocol/geo-sdk/lite';

import type { Metadata } from 'next';

import {
  GRAPH_EXPLORER_FALLBACK_METADATA,
  buildGraphCardMetadata,
  parseGraphRouteIds,
} from '~/core/graph-explorer/graph-card-metadata';
import { loadGraphCardMeta } from '~/core/graph-explorer/server/graph-card-meta';
import { normId } from '~/core/utils/norm-id';

import { GraphExplorerNotFound, GraphExplorerPage } from '~/partials/graph-explorer/graph-explorer-page';

interface Props {
  params: Promise<{ entityId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/** Bots wait on this, so it runs one small query and never the card loader. Filters never reach it. */
export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const ids = parseGraphRouteIds((await params).entityId, await searchParams);
  if (!ids) return { title: 'Not found', robots: { index: false } };
  if (!ids.topicId) return GRAPH_EXPLORER_FALLBACK_METADATA;
  const meta = await loadGraphCardMeta(ids.entityId, ids.topicId).catch(() => null);
  if (!meta) return GRAPH_EXPLORER_FALLBACK_METADATA;
  return buildGraphCardMetadata(meta, { topicId: ids.topicId, spaceId: ids.spaceId });
}

export default async function GraphExplorerRoute({ params }: Props) {
  const { entityId } = await params;
  if (!IdUtils.isValid(entityId)) return <GraphExplorerNotFound />;
  // Dynamic (it awaits params), so `useSearchParams` renders on the server without a Suspense boundary,
  // and the page hydrates with the root rather than after it.
  return <GraphExplorerPage entityId={normId(entityId)} />;
}
