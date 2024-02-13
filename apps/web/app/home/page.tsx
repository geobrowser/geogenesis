import { Effect, Either } from 'effect';
import { cookies } from 'next/headers';
import Link from 'next/link';

import { WALLET_ADDRESS } from '~/core/cookie';
import { Environment } from '~/core/environment';
import { fetchProposalCountByUser } from '~/core/io/fetch-proposal-count-by-user';
import { fetchOnchainProfile, fetchProfile } from '~/core/io/subgraph';
import { fetchInterimMembershipRequests } from '~/core/io/subgraph/fetch-interim-membership-requests';
import { graphql } from '~/core/io/subgraph/graphql';
import { OnchainProfile, Profile } from '~/core/types';
import { NavUtils } from '~/core/utils/utils';

import { Avatar } from '~/design-system/avatar';
import { SmallButton } from '~/design-system/button';

import { Component } from './component';

export const dynamic = 'force-dynamic';

export default async function PersonalHomePage() {
  const connectedAddress = cookies().get(WALLET_ADDRESS)?.value;
  const config = Environment.getConfig(process.env.NEXT_PUBLIC_APP_ENV);

  const [spaces, person, profile, proposalsCount] = await Promise.all([
    getSpacesWhereModerator(connectedAddress),
    connectedAddress ? fetchProfile({ address: connectedAddress }) : null,
    connectedAddress ? fetchOnchainProfile({ address: connectedAddress }) : null,
    connectedAddress
      ? fetchProposalCountByUser({
          userId: connectedAddress,
        })
      : null,
  ]);

  const membershipRequestsBySpace = await Promise.all(
    spaces.map(spaceId => fetchInterimMembershipRequests({ endpoint: config.membershipSubgraph, spaceId }))
  );

  const membershipRequests = membershipRequestsBySpace.flat().sort((a, b) => (a.createdAt > b.createdAt ? -1 : 1));

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
      activeProposals={[]}
      membershipRequests={membershipRequests}
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
      {onchainProfile?.homeSpace && (
        <Link prefetch={false} href={NavUtils.toSpace(onchainProfile.homeSpace)}>
          <SmallButton className="!bg-transparent !text-text">View personal space</SmallButton>
        </Link>
      )}
    </div>
  );
};

// @HACK: (Jan 19, 2024) Right now this query uses the subgraph. Eventually this should move
// to the substream. Right now there's an issue with the substream where it is not correctly
// indexing roles, so for now we are using this workaround while we fix the substream.
const getSpacesWhereModerator = async (address?: string): Promise<string[]> => {
  if (!address) return [];

  const query = `{
      spaces(
        where: {
            editorControllers_contains: ["0x48f03232F947A6d92A5E839936c9250999f404a0"]
        }
      ) {
        id
      }
    }`;

  const permissionedSpacesEffect = graphql<{ spaces: { id: string }[] }>({
    endpoint: Environment.getConfig(process.env.NEXT_PUBLIC_APP_ENV).subgraph,
    query,
  });

  const permissionlessSpacesEffect = graphql<{ spaces: { id: string }[] }>({
    endpoint: Environment.getConfig(process.env.NEXT_PUBLIC_APP_ENV).permissionlessSubgraph,
    query: query,
  });

  const [permissioned, permissionless] = await Promise.all([
    Effect.runPromise(Effect.either(permissionedSpacesEffect)),
    Effect.runPromise(Effect.either(permissionlessSpacesEffect)),
  ]);

  if (Either.isLeft(permissioned)) {
    const error = permissioned.left;

    switch (error._tag) {
      case 'GraphqlRuntimeError':
        console.error(`Encountered runtime graphql error in getSpacesWhereModerator.`, error.message);

      default:
        console.error(`${error._tag}: Unable to fetch permissioned spaces where editor controller`);
    }
  }

  if (Either.isLeft(permissionless)) {
    const error = permissionless.left;

    switch (error._tag) {
      case 'GraphqlRuntimeError':
        console.error(`Encountered runtime graphql error in getSpacesWhereModerator.`, error.message);

      default:
        console.error(`${error._tag}: Unable to fetch permissionless spaces where editor controller`);
    }
  }

  let permissionedSpaces: { id: string }[] = Either.isLeft(permissioned) ? [] : permissioned.right.spaces;
  let permissionlessSpaces: { id: string }[] = Either.isLeft(permissionless) ? [] : permissionless.right.spaces;

  const spaces = [...permissionedSpaces, ...permissionlessSpaces].map(space => space.id);
  return spaces;
};
