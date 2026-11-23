import { IdUtils } from '@geoprotocol/geo-sdk/lite';

import * as React from 'react';

import type { Metadata } from 'next';

import { notFound } from 'next/navigation';

import { normId } from '~/core/utils/norm-id';

import { GraphExplorerPage } from '~/partials/graph-explorer/graph-explorer-page';

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

  // Suspense: the page reads `useSearchParams`.
  return (
    <React.Suspense fallback={null}>
      <GraphExplorerPage entityId={normId(entityId)} />
    </React.Suspense>
  );
}
