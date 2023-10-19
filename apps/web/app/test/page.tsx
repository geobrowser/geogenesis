import { Effect } from 'effect';

import { Environment } from '~/core/environment';
import { fetchProfilePermissionless } from '~/core/io/subgraph/fetch-profile-permissionless';
import { graphql } from '~/core/io/subgraph/graphql';

const query = `query {
  geoProfiles {
    id
    homeSpace
    account
  }
}`;

export default async function Test() {
  const config = Environment.getConfig(process.env.NEXT_PUBLIC_APP_ENV);
  const onchainProfilesEffect = graphql<{
    geoProfiles: {
      id: string;
      homeSpace: string;
      account: string;
    }[];
  }>({
    endpoint: config.profileSubgraph,
    query,
  });

  const result = await Effect.runPromise(onchainProfilesEffect);

  console.log(result.geoProfiles.length);

  const accountsWithoutGeoProfile = (
    await Promise.all(
      result.geoProfiles.map(async p => {
        const result = await fetchProfilePermissionless({
          address: p.account,
          endpoint: config.permissionlessSubgraph,
        });

        if (!result) {
          return p;
        }

        return null;
      })
    )
  ).filter((p): p is { id: string; homeSpace: string; account: string } => p !== null);

  console.log({ accountsWithoutGeoProfile, length: accountsWithoutGeoProfile.length });

  return <div>Test</div>;
}
