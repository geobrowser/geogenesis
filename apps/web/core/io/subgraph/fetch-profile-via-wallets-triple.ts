import { Schema } from '@effect/schema';
import { SYSTEM_IDS } from '@geogenesis/sdk';
import { Effect, Either } from 'effect';

import { Environment } from '~/core/environment';
import { Profile } from '~/core/types';
import { Entities } from '~/core/utils/entity';
import { NavUtils } from '~/core/utils/utils';

import { EntityDto } from '../dto/entities';
import { SubstreamEntity } from '../schema';
import { versionFragment } from './fragments';
import { graphql } from './graphql';

const query = (address: string) => {
  return `{
    entities(
      first: 1
      filter: {
        currentVersion: {
          version: {
            relationsByFromVersionId: {
              some: {
                typeOf: { entityId: { equalTo: "${SYSTEM_IDS.ACCOUNTS_ATTRIBUTE}" } }
                toVersion: {
                  triples: {
                    some: {
                      attributeId: { equalTo: "${SYSTEM_IDS.ADDRESS_ATTRIBUTE}" }
                      textValue: {
                        equalTo: "${address}"
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    ) {
      nodes {
        id
        currentVersion {
          version {
            ${versionFragment}
          }
        }
      }
    }
  }
`;
};

interface NetworkResult {
  entities: { nodes: SubstreamEntity[] };
}

export async function fetchProfileViaWalletsTripleAddress(address: string): Promise<Profile> {
  const endpoint = Environment.getConfig().api;

  const fetchEffect = graphql<NetworkResult>({
    endpoint,
    query: query(address),
  });

  const result = await Effect.runPromise(Effect.either(fetchEffect));

  if (Either.isLeft(result)) {
    const error = result.left;

    switch (error._tag) {
      case 'AbortError':
        // Right now we re-throw AbortErrors and let the callers handle it. Eventually we want
        // the caller to consume the error channel as an effect. We throw here the typical JS
        // way so we don't infect more of the codebase with the effect runtime.
        throw error;
      default:
        console.error(`${error._tag}: Unable to fetch profile for address ${address}. ${String(error)}`);
        return defaultProfile(address);
    }
  }

  const entities = result.right.entities.nodes;

  if (entities.length === 0) {
    return defaultProfile(address);
  }

  const profile = entities[0];

  const parsedProfile = Either.match(Schema.decodeEither(SubstreamEntity)(profile), {
    onLeft: error => {
      console.error(`Unable to decode entity ${profile.id} with error ${error}`);
      return null;
    },
    onRight: entity => {
      return EntityDto(entity);
    },
  });

  if (!parsedProfile) {
    return defaultProfile(address);
  }

  const space = parsedProfile.spaces[0];

  return {
    id: parsedProfile.id,
    name: parsedProfile.name,
    avatarUrl: Entities.avatar(parsedProfile.relationsOut),
    coverUrl: Entities.cover(parsedProfile.relationsOut),
    profileLink: space ? NavUtils.toEntity(space, profile.id) : null,
    address: address as `0x${string}`,
  };
}

function defaultProfile(address: string): Profile {
  return {
    id: '',
    address: address as `0x${string}`,
    avatarUrl: null,
    coverUrl: null,
    name: null,
    profileLink: null,
  };
}
