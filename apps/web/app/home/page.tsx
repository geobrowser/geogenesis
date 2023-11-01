import { cookies } from 'next/headers';

import { Cookie } from '~/core/cookie';
import { Environment } from '~/core/environment';
import { fetchInterimMembershipRequests } from '~/core/io/subgraph/fetch-interim-membership-requests';
import { Space } from '~/core/types';

import { Component } from './component';

export default async function PersonalHomePage() {
  const connectedAddress = cookies().get(Cookie.WALLET_ADDRESS)?.value;
  const config = Environment.getConfig(process.env.NEXT_PUBLIC_APP_ENV);

  const spaces = await getSpacesWhereAdmin(connectedAddress);

  const membershipRequestsBySpace = await Promise.all(
    spaces.map(spaceId => fetchInterimMembershipRequests({ endpoint: config.membershipSubgraph, spaceId }))
  );

  const membershipRequests = membershipRequestsBySpace.flat().sort((a, b) => (a.createdAt > b.createdAt ? -1 : 1));

  return <Component activeProposals={[]} membershipRequests={membershipRequests} />;
}

export const metadata = {
  title: `For you`,
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
