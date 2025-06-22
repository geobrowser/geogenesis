import { SystemIds } from '@graphprotocol/grc-20';
import { Schema } from 'effect';
import { Effect, Either } from 'effect';

import { Environment } from '~/core/environment';
import { Profile } from '~/core/types';
import { Entities } from '~/core/utils/entity';
import { NavUtils } from '~/core/utils/utils';

import { EntityDtoLive } from '../dto/entities';
import { SubstreamEntityLive } from '../schema';
import { getEntityFragment } from './fragments';
import { graphql } from './graphql';

const query = (address: string) => {
  return `{
    entities(
      first: 1
      filter: {
        currentVersion: {
          version: {
            versionSpaces: {
              some: {
                space: {
                  spaceEditors: {
                    some: {
                      accountId: {
                        equalTo: "${address}"
                      }
                    }
                  }
                }
              }
            }
            relationsByFromVersionId: {
              some: {
                typeOf: { id: { equalTo: "${SystemIds.ACCOUNTS_PROPERTY}" } }
                toEntity: {
                  currentVersion: {
                    version: {
                      triples: {
                        some: {
                          attributeId: { equalTo: "${SystemIds.ADDRESS_PROPERTY}" }
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
        }
      }
    ) {
      nodes {
        id
        currentVersion {
          version {
            ${getEntityFragment()}
          }
        }
      }
    }
  }
`;
};

interface NetworkResult {
  entities: { nodes: SubstreamEntityLive[] };
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

  // Flaky
  if (!result.right) {
    return defaultProfile(address);
  }

  const entities = result.right.entities.nodes;

  if (entities.length === 0) {
    return defaultProfile(address);
  }

  const profile = entities[0];

  const parsedProfile = Either.match(Schema.decodeEither(SubstreamEntityLive)(profile), {
    onLeft: error => {
      console.error(`Unable to decode entity ${profile.id} with error ${error}`);
      return null;
    },
    onRight: entity => {
      return EntityDtoLive(entity);
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

export function defaultProfile(address: string): Profile {
  return {
    id: address,
    address: address as `0x${string}`,
    avatarUrl: null,
    coverUrl: null,
    name: null,
    profileLink: null,
  };
}
