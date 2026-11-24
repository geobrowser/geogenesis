import { IdUtils } from '@geoprotocol/geo-sdk/lite';

import * as React from 'react';

import type { Metadata } from 'next';

import { notFound } from 'next/navigation';

import { normId } from '~/core/utils/norm-id';

import { GraphExplorerPage } from '~/partials/graph-explorer/graph-explorer-page';
import { GraphExplorerShell } from '~/partials/graph-explorer/graph-explorer-shell';

interface Props {
  params: Promise<{ entityId: string }>;
}

export const metadata: Metadata = {
  title: 'Graph explorer',
  robots: { index: false },
};

export default async function GraphExplorerRoute({ params }: Props) {
  const { entityId } = await params;
  if (!IdUtils.isValid(entityId)) notFound();

  // Suspense: the page reads `useSearchParams`. The fallback is the server-rendered first paint.
  return (
    <React.Suspense fallback={<GraphExplorerShell />}>
      <GraphExplorerPage entityId={normId(entityId)} />
    </React.Suspense>
  );
}
