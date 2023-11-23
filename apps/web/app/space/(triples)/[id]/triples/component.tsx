'use client';

import { InitialTripleStoreParams } from '~/core/state/triple-store/triple-store';
import { TripleStoreProvider } from '~/core/state/triple-store/triple-store-provider';

import { Spacer } from '~/design-system/spacer';

import { SpaceHeader } from '~/partials/space-page/space-header';
import { SpaceNavbar } from '~/partials/space-page/space-navbar';
import { Triples } from '~/partials/triples-page/triples';

interface Props {
  spaceId: string;
  spaceName: string | null;
  spaceImage: string | null;
  initialParams: InitialTripleStoreParams;
}

export function Component({ spaceId, spaceImage, spaceName, initialParams }: Props) {
  return (
    <div>
      <SpaceHeader spaceId={spaceId} spaceImage={spaceImage} spaceName={spaceName} />

      <Spacer height={34} />
      <SpaceNavbar spaceId={spaceId} />

      <TripleStoreProvider space={spaceId} initialParams={initialParams}>
        <Triples spaceId={spaceId} />
      </TripleStoreProvider>
    </div>
  );
}
