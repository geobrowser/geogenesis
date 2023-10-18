import * as Effect from 'effect/Effect';
import * as Either from 'effect/Either';
import { v4 as uuid } from 'uuid';

import { Environment } from '~/core/environment';
import { Profile } from '~/core/types';
import { Entity } from '~/core/utils/entity';

import { Subgraph } from '..';
import { fetchEntity } from './fetch-entity';
import { fetchOnchainProfile } from './fetch-on-chain-profile';
import { graphql } from './graphql';
import { NetworkEntity } from './network-local-mapping';

// We fetch for geoEntities -> name because the id of the wallet entity might not be the
// same as the actual wallet address.
function getFetchProfileQuery(profileId: string) {
  return `query {
    geoEntity(id: "${profileId}") {
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

export interface FetchProfilePermissionlessOptions {
  endpoint: string;
  address: string;
  signal?: AbortController['signal'];
}

export async function fetchProfilePermissionless(options: FetchProfilePermissionlessOptions): Promise<Profile | null> {
  const onchainProfile = await fetchOnchainProfile({
    address: options.address,
    endpoint: Environment.options.production.profileSubgraph,
  });

  if (!onchainProfile) {
    return null;
  }

  const profile = await fetchEntity({
    endpoint: Environment.options.production.permissionlessSubgraph,
    id: onchainProfile.id,
  });

  if (!profile) {
    return null;
  }

  return {
    id: profile.id,
    name: profile.name,
    avatarUrl: Entity.avatar(profile.triples),
    coverUrl: Entity.cover(profile.triples),
  };
}
