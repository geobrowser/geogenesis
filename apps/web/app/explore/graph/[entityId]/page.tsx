import { IdUtils } from '@geoprotocol/geo-sdk/lite';

import type { Metadata } from 'next';

import { normId } from '~/core/utils/norm-id';

import { GraphExplorerNotFound, GraphExplorerPage } from '~/partials/graph-explorer/graph-explorer-page';

interface Props {
  params: Promise<{ entityId: string }>;
}

export const metadata: Metadata = {
  title: 'Graph explorer',
  robots: { index: false },
};

export default async function GraphExplorerRoute({ params }: Props) {
  const { entityId } = await params;
  if (!IdUtils.isValid(entityId)) return <GraphExplorerNotFound />;
  // Dynamic (it awaits params), so `useSearchParams` renders on the server without a Suspense boundary,
  // and the page hydrates with the root rather than after it.
  return <GraphExplorerPage entityId={normId(entityId)} />;
}
