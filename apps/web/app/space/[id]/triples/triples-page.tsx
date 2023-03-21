'use client';

import * as React from 'react';
import Head from 'next/head';

import { SpaceHeader } from '~/modules/components/space/space-header';
import { SpaceNavbar } from '~/modules/components/space/space-navbar';
import { Triples } from '~/modules/components/triples';
import { Spacer } from '~/modules/design-system/spacer';
import { TripleStoreProvider } from '~/modules/triple';
import { Triple } from '~/modules/types';

interface Props {
  spaceId: string;
  spaceName?: string;
  spaceImage: string | null;
  initialTriples: Triple[];
}

export function TriplesPageClient({ spaceId, spaceName, spaceImage, initialTriples }: Props) {
  return (
    <div>
      <Head>
        <title>{spaceName ?? spaceId}</title>
        <meta property="og:url" content={`https://geobrowser.io/${spaceId}}`} />
      </Head>

      <SpaceHeader spaceId={spaceId} spaceImage={spaceImage} spaceName={spaceName} />

      <Spacer height={34} />
      <SpaceNavbar spaceId={spaceId} />

      <TripleStoreProvider space={spaceId} initialTriples={initialTriples}>
        <Triples spaceId={spaceId} initialTriples={initialTriples} />
      </TripleStoreProvider>
    </div>
  );
}
