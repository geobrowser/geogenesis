import * as React from 'react';

import * as Effect from 'effect/Effect';
import { cookies } from 'next/headers';

import { PLACEHOLDER_SPACE_IMAGE } from '~/core/constants';
import { WALLET_ADDRESS } from '~/core/cookie';
import type { Space } from '~/core/io/dto/spaces';
import { getSpaces } from '~/core/io/queries';
import { cachedFetchProfile } from '~/core/io/subgraph';
import { compareSpaceListOrderByRankNameId } from '~/core/utils/space/browse-space-list-sort';

import { GovernanceHomeChromeProvider } from './governance-home-chrome-context';
import { GovernanceHomeSidebar, GovernanceHomeSidebarSkeleton } from './governance-home-sidebar';
import { GovernanceHomeSidebarCounts } from './governance-home-sidebar-counts';
import { getGovernanceHomeSpaceContext } from './governance-home-space-ids';
import { LoadingSkeleton } from './loading-skeleton';

export const metadata = {
  title: `Governance home`,
};

type GovernanceSpaceOption = { id: string; name: string; image: string | null; unnamed: boolean };

function mapAndSortGovernanceSpaceOptions(spaces: Space[]): GovernanceSpaceOption[] {
  return spaces
    .map(s => {
      const rawName = s.entity?.name?.trim() ?? '';
      const unnamed = rawName.length === 0;
      return {
        id: s.id,
        name: unnamed ? s.id.slice(0, 8) : rawName,
        image: s.entity?.image && s.entity.image !== PLACEHOLDER_SPACE_IMAGE ? s.entity.image : null,
        unnamed,
      };
    })
    .sort(compareSpaceListOrderByRankNameId);
}

export default async function GovernanceHomeLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies();
  const connectedAddress = cookieStore.get(WALLET_ADDRESS)?.value;

  return (
    <div className="mx-auto w-full max-w-[880px]">
      <GovernanceHomeHeader />
      <React.Suspense fallback={<GovernanceHomeChromeSkeleton />}>
        <GovernanceHomeChrome connectedAddress={connectedAddress}>{children}</GovernanceHomeChrome>
      </React.Suspense>
    </div>
  );
}

async function GovernanceHomeChrome({
  connectedAddress,
  children,
}: {
  connectedAddress?: string;
  children: React.ReactNode;
}) {
  const person = connectedAddress ? await cachedFetchProfile(connectedAddress) : null;

  let editorSpaceOptions: GovernanceSpaceOption[] = [];
  let myProposalSpaceOptions: GovernanceSpaceOption[] = [];

  if (person?.spaceId) {
    const ctx = await getGovernanceHomeSpaceContext(person.spaceId);
    const [editorSpaces, mySpaces] = await Promise.all([
      ctx.editorIds.length ? Effect.runPromise(getSpaces({ spaceIds: ctx.editorIds })) : Promise.resolve([]),
      ctx.myProposalSpaceIds.length
        ? Effect.runPromise(getSpaces({ spaceIds: ctx.myProposalSpaceIds }))
        : Promise.resolve([]),
    ]);
    editorSpaceOptions = mapAndSortGovernanceSpaceOptions(editorSpaces);
    myProposalSpaceOptions = mapAndSortGovernanceSpaceOptions(mySpaces);
  }

  const sidebar = person?.spaceId ? (
    <React.Suspense fallback={<GovernanceHomeSidebarSkeleton />}>
      <GovernanceHomeSidebarCounts memberSpaceId={person.spaceId} />
    </React.Suspense>
  ) : (
    <GovernanceHomeSidebar />
  );

  return (
    <GovernanceHomeChromeProvider
      editorSpaceOptions={editorSpaceOptions}
      myProposalSpaceOptions={myProposalSpaceOptions}
      sidebar={sidebar}
    >
      {children}
    </GovernanceHomeChromeProvider>
  );
}

function GovernanceHomeHeader() {
  return (
    <div className="flex w-full items-center justify-between">
      <h1 className="text-mainPage text-text">Governance</h1>
    </div>
  );
}

function GovernanceHomeChromeSkeleton() {
  return (
    <>
      <div className="mt-8 flex gap-4">
        <div className="h-8 w-28 animate-pulse rounded bg-grey-01" />
        <div className="h-8 w-24 animate-pulse rounded bg-grey-01" />
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <div className="h-8 w-28 animate-pulse rounded bg-grey-01" />
        <div className="h-8 w-32 animate-pulse rounded bg-grey-01" />
        <div className="h-8 w-24 animate-pulse rounded bg-grey-01" />
      </div>
      <div className="mt-4 flex gap-8">
        <div className="w-2/3 space-y-2">
          <LoadingSkeleton />
          <LoadingSkeleton />
          <LoadingSkeleton />
        </div>
        <div className="w-1/3">
          <GovernanceHomeSidebarSkeleton />
        </div>
      </div>
    </>
  );
}
