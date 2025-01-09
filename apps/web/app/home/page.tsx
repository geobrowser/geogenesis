import { cookies } from 'next/headers';

import * as React from 'react';

import { WALLET_ADDRESS } from '~/core/cookie';
import { fetchProposalCountByUser } from '~/core/io/fetch-proposal-count-by-user';
import { fetchProfile } from '~/core/io/subgraph';
import { Profile } from '~/core/types';

import { Avatar } from '~/design-system/avatar';

import { Component } from './component';

export const dynamic = 'force-dynamic';

interface Props {
  searchParams: { proposalType?: 'membership' | 'content' };
}

export default async function PersonalHomePage(props: Props) {
  const connectedAddress = cookies().get(WALLET_ADDRESS)?.value;

  const [person, proposalsCount] = await Promise.all([
    connectedAddress ? fetchProfile({ address: connectedAddress }) : null,
    connectedAddress
      ? fetchProposalCountByUser({
          userId: connectedAddress,
        })
      : null,
  ]);

  const acceptedProposalsCount = proposalsCount ?? 0;

  return (
    <Component
      header={<PersonalHomeHeader person={person} address={connectedAddress ?? null} />}
      proposalType={props.searchParams.proposalType}
      acceptedProposalsCount={acceptedProposalsCount}
      connectedAddress={connectedAddress}
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
