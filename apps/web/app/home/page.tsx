import { cookies } from 'next/headers';
import Link from 'next/link';

import { WALLET_ADDRESS } from '~/core/cookie';
import { Environment } from '~/core/environment';
import { fetchProposalCountByUser } from '~/core/io/fetch-proposal-count-by-user';
import { fetchOnchainProfile, fetchProfile } from '~/core/io/subgraph';
import { OnchainProfile, Profile } from '~/core/types';
import { NavUtils } from '~/core/utils/utils';

import { Avatar } from '~/design-system/avatar';
import { SmallButton } from '~/design-system/button';

import { Component } from './component';
import { getActiveProposalsForSpacesWhereEditor } from './fetch-active-proposals-in-editor-spaces';

export const dynamic = 'force-dynamic';

interface Props {
  searchParams: { proposalType?: 'member' | 'editor' | 'content' };
}

export default async function PersonalHomePage(props: Props) {
  const connectedAddress = cookies().get(WALLET_ADDRESS)?.value;

  const [proposals, person, profile, proposalsCount] = await Promise.all([
    getActiveProposalsForSpacesWhereEditor(connectedAddress),
    connectedAddress ? fetchProfile({ address: connectedAddress }) : null,
    connectedAddress ? fetchOnchainProfile({ address: connectedAddress }) : null,
    connectedAddress
      ? fetchProposalCountByUser({
          userId: connectedAddress,
        })
      : null,
  ]);

  const acceptedProposalsCount = proposalsCount ?? 0;

  return (
    <Component
      header={
        <PersonalHomeHeader
          person={person ? person[1] : null}
          address={connectedAddress ?? null}
          onchainProfile={profile}
        />
      }
      activeProposals={proposals}
      acceptedProposalsCount={acceptedProposalsCount}
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
      {onchainProfile?.homeSpaceId && (
        <Link prefetch={false} href={NavUtils.toSpace(onchainProfile.homeSpaceId)}>
          <SmallButton className="!bg-transparent !text-text">View personal space</SmallButton>
        </Link>
      )}
    </div>
  );
};
