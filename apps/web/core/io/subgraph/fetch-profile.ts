import { SYSTEM_IDS } from '@geogenesis/ids';
import { Effect } from 'effect';
import { v4 as uuid } from 'uuid';

import { Profile } from '~/core/types';

import { fetchEntity } from './fetch-entity';
import { graphql } from './graphql';
import { NetworkEntity } from './network-local-mapping';

export interface FetchProfileOptions {
  endpoint: string;
  address: string;
  abortController?: AbortController;
}

interface NetworkResult {
  data: {
    geoEntities: NetworkEntity[];
  };
  errors: unknown[];
}

// We fetch for geoEntities -> name because the id of the wallet entity might not be the
// same as the actual wallet address.
function getFetchProfileQuery(address: string) {
  return `query {
    geoEntities(where: {name_starts_with_nocase: ${JSON.stringify(address)}}, first: 1) {
      id
      name
      entityOf {
        id
        stringValue
        valueId
        valueType
        numberValue
        space {
          id
        }
        entityValue {
          id
          name
        }
        attribute {
          id
          name
        }
        entity {
          id
          name
        }
      }
    }
  }`;
}

// Right now we use an ad-hoc Profile mechanism derived from Person entities in the People space.
// We are currently working on the Geo Profile system which will replace this.
//
// We query for a wallet with the passed-in address. We then search for the Person relation associated
// with the wallet and construct a Profile from that.
//
// Eventually this will all be indexed in the subgraph and we will be able to query for a Profile directly.
export async function fetchProfile(options: FetchProfileOptions): Promise<[string, Profile] | null> {
  const queryId = uuid();

  const fetchWalletsGraphqlEffect = graphql<NetworkResult>({
    endpoint: options.endpoint,
    query: getFetchProfileQuery(options.address),
    abortController: options.abortController,
  });

  // @TODO: Catch by known tag and unexpected errors
  // retries
  const fetchWalletsGraphqlFetchEffectWithErrorHandling = fetchWalletsGraphqlEffect.pipe(
    Effect.catchAll(() => {
      console.error(
        `Unable to fetch wallets to derive profile, queryId: ${queryId} endpoint: ${options.endpoint} address: ${options.address}`
      );
      return Effect.succeed({
        data: {
          geoEntities: [],
        },
        errors: [],
      });
    })
  );

  const walletsResult = await Effect.runPromise(fetchWalletsGraphqlFetchEffectWithErrorHandling);

  if (walletsResult.errors?.length > 0) {
    console.error(
      `Encountered runtime graphql error in fetchProfile. queryId: ${queryId} endpoint: ${options.endpoint} address: ${
        options.address
      }
      
      queryString: ${getFetchProfileQuery(options.address)}
      `,
      walletsResult.errors
    );
    return null;
  }

  const walletEntities = walletsResult.data.geoEntities;

  // @TEMP: We need to fetch the actual Person entity related to Wallet to access the triple with
  // the avatar attribute. If we were indexing Profiles in the subgraph we wouldn't have to do this.
  const maybeWallets = await Promise.all(
    walletEntities.map(e => fetchEntity({ id: e.id, endpoint: options.endpoint }))
  );
  const wallets = maybeWallets.flatMap(entity => (entity ? [entity] : []));

  // We take the first wallet for a given address since there should only be one while in closed alpha.
  const wallet = wallets[0] ?? null;

  if (!wallet) {
    return null;
  }

  // We have a backlink from a Wallet entity to a Person entity. We need to fetch the Person entity
  // to access profile attributes like the Avatar.
  const personTriple = wallet?.triples.find(t => t.attributeId === SYSTEM_IDS.PERSON_ATTRIBUTE);
  const personEntityId = personTriple?.value.id ?? null;

  if (!personEntityId) {
    return null;
  }

  const maybePerson = await fetchEntity({ id: personEntityId, endpoint: options.endpoint });

  const avatarTriple = maybePerson?.triples.find(t => t.attributeId === SYSTEM_IDS.AVATAR_ATTRIBUTE);
  const avatarUrl = avatarTriple?.value.type === 'image' ? avatarTriple.value.value : null;

  return [
    options.address,
    {
      id: maybePerson?.id ?? '',
      name: maybePerson?.name ?? null,
      avatarUrl: avatarUrl,
    },
  ];
}
