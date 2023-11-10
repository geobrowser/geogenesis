import { cookies } from 'next/headers';
import Link from 'next/link';

import { Cookie } from '~/core/cookie';
import { Environment } from '~/core/environment';
import { fetchOnchainProfile, fetchProfile } from '~/core/io/subgraph';
import { fetchInterimMembershipRequests } from '~/core/io/subgraph/fetch-interim-membership-requests';
import { OnchainProfile, Profile, Space } from '~/core/types';
import { NavUtils } from '~/core/utils/utils';

import { Avatar } from '~/design-system/avatar';
import { SmallButton } from '~/design-system/button';

import { Component } from './component';

export const dynamic = 'force-dynamic';

export default async function PersonalHomePage() {
  const connectedAddress = cookies().get(Cookie.WALLET_ADDRESS)?.value;
  const config = Environment.getConfig(process.env.NEXT_PUBLIC_APP_ENV);

  const [spaces, person, profile] = await Promise.all([
    getSpacesWhereAdmin(connectedAddress),
    connectedAddress ? fetchProfile({ address: connectedAddress, endpoint: config.subgraph }) : null,
    connectedAddress ? fetchOnchainProfile({ address: connectedAddress }) : null,
  ]);

  const membershipRequestsBySpace = await Promise.all(
    spaces.map(spaceId => fetchInterimMembershipRequests({ endpoint: config.membershipSubgraph, spaceId }))
  );

  const membershipRequests = membershipRequestsBySpace.flat().sort((a, b) => (a.createdAt > b.createdAt ? -1 : 1));

  return (
    <Component
      header={
        <PersonalHomeHeader
          person={person ? person[1] : null}
          address={connectedAddress ?? null}
          onchainProfile={profile}
        />
      }
      activeProposals={[]}
      membershipRequests={membershipRequests}
    />
  );
}

export const metadata = {
  title: `For you`,
};

interface HeaderProps {
  person: Profile | null;
  onchainProfile: OnchainProfile | null;
  address: string | null;
}

const PersonalHomeHeader = ({ onchainProfile, person, address }: HeaderProps) => {
  return (
    <div className="flex w-full items-center justify-between">
      <div className="flex items-center gap-4">
        <div className="relative h-14 w-14 overflow-hidden rounded-lg bg-grey-01">
          <Avatar value={address ?? undefined} avatarUrl={person?.avatarUrl} size={56} square={true} />
        </div>
        <h2 className="text-largeTitle">{person?.name ?? 'Anonymous'}</h2>
      </div>
      {onchainProfile?.homeSpace && (
        <Link prefetch={false} href={NavUtils.toSpace(onchainProfile.homeSpace)}>
          <SmallButton className="!bg-transparent !text-text">View personal space</SmallButton>
        </Link>
      )}
    </div>
  );
};

const getSpacesWhereAdmin = async (address?: string): Promise<string[]> => {
  if (!address) return [];

  try {
    const query = `{
      spaces(where: {admins_: {id: "${address}"}}) {
        id
      }
    }`;

    const response = await fetch(Environment.getConfig(process.env.NEXT_PUBLIC_APP_ENV).subgraph, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query: query,
      }),
      cache: 'no-store',
    });

    const { data } = (await response.json()) as {
      data: {
        spaces: Space[];
      };
    };

    const spaces = data.spaces.map(space => space.id);

    return spaces;
  } catch (error) {
    return [];
  }
};
