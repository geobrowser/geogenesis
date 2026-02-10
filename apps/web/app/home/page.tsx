import { Effect } from 'effect';
import { cookies } from 'next/headers';

import { WALLET_ADDRESS } from '~/core/cookie';
import { fetchSidebarCounts } from '~/core/io/fetch-sidebar-counts';
import { fetchProfile } from '~/core/io/subgraph';
import { Profile } from '~/core/types';

import { Avatar } from '~/design-system/avatar';

import { Component } from './component';

export const dynamic = 'force-dynamic';

interface Props {
  searchParams: Promise<{ proposalType?: 'membership' | 'content' }>;
}

export default async function PersonalHomePage(props: Props) {
  const connectedAddress = (await cookies()).get(WALLET_ADDRESS)?.value;

  const person = connectedAddress ? await Effect.runPromise(fetchProfile(connectedAddress)) : null;

  const sidebarCounts = person?.spaceId ? await fetchSidebarCounts(person.spaceId) : undefined;

  return (
    <Component
      header={<PersonalHomeHeader person={person} address={connectedAddress ?? null} />}
      proposalType={(await props.searchParams).proposalType}
      sidebarCounts={sidebarCounts}
      connectedAddress={connectedAddress}
      connectedSpaceId={person?.spaceId}
    />
  );
}

export const metadata = {
  title: `For you`,
};

interface HeaderProps {
  person: Profile | null;
  address: string | null;
}

function PersonalHomeHeader({ person, address }: HeaderProps) {
  return (
    <div className="flex w-full items-center justify-between">
      <div className="flex items-center gap-4">
        <div className="relative h-14 w-14 overflow-hidden rounded-lg bg-grey-01">
          <Avatar value={address ?? undefined} avatarUrl={person?.avatarUrl} size={56} square={true} />
        </div>
        <h2 className="text-largeTitle">{person?.name ?? person?.id ?? address ?? 'Anonymous'}</h2>
      </div>
    </div>
  );
}
