import { cookies } from 'next/headers';

import { Cookie } from '~/core/cookie';
import { options } from '~/core/environment/environment';
import { fetchInterimMembershipRequests } from '~/core/io/subgraph/fetch-interim-membership-requests';
import { Space } from '~/core/types';

import { Component } from './component';

export default async function PersonalHomePage() {
  const connectedAddress = cookies().get(Cookie.WALLET_ADDRESS)?.value;

  const spaces = await getSpacesWhereAdmin(connectedAddress);

  const membershipRequestsBySpace = await Promise.all(
    spaces.map(spaceId => fetchInterimMembershipRequests({ endpoint: options.production.membershipSubgraph, spaceId }))
  );

  const membershipRequests = membershipRequestsBySpace.flat().sort((a, b) => (a.createdAt > b.createdAt ? -1 : 1));

  return <Component membershipRequests={membershipRequests} />;
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

    const response = await fetch(options.production.subgraph, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query: query,
      }),
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
