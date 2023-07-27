'use client';

import { SpaceHeader } from '~/partials/space-page/space-header';
import { SpaceNavbar } from '~/partials/space-page/space-navbar';
import { Triples } from '~/partials/triples-page/triples';
import { Spacer } from '~/design-system/spacer';
import { Triple } from '~/core/types';
import { InitialTripleStoreParams, TripleStoreProvider } from '~/core/state/triple-store';

interface Props {
  spaceId: string;
  spaceName?: string;
  spaceImage: string | null;
  initialTriples: Triple[];
  initialParams: InitialTripleStoreParams;
}

export function Component({ spaceId, spaceImage, spaceName, initialTriples, initialParams }: Props) {
  return (
    <div>
      <SpaceHeader spaceId={spaceId} spaceImage={spaceImage} spaceName={spaceName} />

      <Spacer height={34} />
      <SpaceNavbar spaceId={spaceId} />

      <TripleStoreProvider space={spaceId} initialParams={initialParams}>
        <Triples spaceId={spaceId} initialTriples={initialTriples} />
      </TripleStoreProvider>
    </div>
  );
}
