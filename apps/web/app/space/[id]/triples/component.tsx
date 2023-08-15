'use client';

import { InitialTripleStoreParams, TripleStoreProvider } from '~/core/state/triple-store';
import { Triple } from '~/core/types';

import { Spacer } from '~/design-system/spacer';

import { SpaceHeader } from '~/partials/space-page/space-header';
import { SpaceNavbar } from '~/partials/space-page/space-navbar';
import { Triples } from '~/partials/triples-page/triples';

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

      <Triples spaceId={spaceId} initialTriples={initialTriples} />
    </div>
  );
}
