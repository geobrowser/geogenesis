import { Effect, Either } from 'effect';

import { Environment } from '~/core/environment';
import { GeoDate } from '~/core/utils/utils';

import { getSpaceConfigFromMetadata } from '../schema';
import { Subspace } from './fetch-subspaces';
import { spaceMetadataFragment } from './fragments';
import { graphql } from './graphql';
import { NetworkSpaceResult } from './types';

const inflightSubspacesForSpaceIdQuery = (spaceId: string, endTime: number) =>
  `
    {
      proposals(
        filter: {
          type: { equalTo: ADD_SUBSPACE }
          spaceId: { equalTo: "${spaceId}" }
          endTime: { greaterThanOrEqualTo: ${GeoDate.toGeoTime(endTime)} }
        }
      ) {
        nodes {
          proposedSubspaces {
            nodes {
              spaceBySubspace {
                id
                daoAddress
                spaceEditors {
                  totalCount
                }
                spaceMembers {
                  totalCount
                }
                spacesMetadata {
                  nodes {
                    entity {
                      ${spaceMetadataFragment}
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
`;

interface NetworkResult {
  proposals: {
    nodes: {
      proposedSubspaces: {
        nodes: {
          spaceBySubspace: Pick<NetworkSpaceResult, 'spacesMetadata' | 'id' | 'daoAddress'> & {
            spaceMembers: { totalCount: number };
            spaceEditors: { totalCount: number };
          };
        }[];
      };
    }[];
  };
}

export async function fetchInFlightSubspaceProposalsForSpaceId(spaceId: string) {
  const queryEffect = graphql<NetworkResult>({
    query: inflightSubspacesForSpaceIdQuery(spaceId, Date.now()),
    endpoint: Environment.getConfig().api,
  });

  const resultOrError = await Effect.runPromise(Effect.either(queryEffect));

  if (Either.isLeft(resultOrError)) {
    const error = resultOrError.left;

    switch (error._tag) {
      case 'AbortError':
        // Right now we re-throw AbortErrors and let the callers handle it. Eventually we want
        // the caller to consume the error channel as an effect. We throw here the typical JS
        // way so we don't infect more of the codebase with the effect runtime.
        throw error;
      case 'GraphqlRuntimeError':
        console.error(
          `Encountered runtime graphql error in subspaces-by-name. 

          queryString: ${inflightSubspacesForSpaceIdQuery(spaceId, Date.now())}
          `,
          error.message
        );
        return [];

      default:
        console.error(`${error._tag}: Unable to fetch spaces in subspaces-by-name`);
        return [];
    }
  }

  const result = resultOrError.right;

  const subspaces = result?.proposals?.nodes.flatMap(p => p?.proposedSubspaces.nodes);

  const spaces = subspaces?.map((spaceBySubspace): Subspace => {
    const subspace = spaceBySubspace?.spaceBySubspace;
    console.log('subspace', subspace);
    const spaceConfigWithImage = getSpaceConfigFromMetadata(
      subspace?.id ?? '',
      subspace?.spacesMetadata.nodes[0].entity
    );

    return {
      id: subspace!.id,
      daoAddress: subspace!.daoAddress,
      totalEditors: subspace?.spaceEditors.totalCount ?? 0,
      totalMembers: subspace?.spaceMembers.totalCount ?? 0,
      spaceConfig: spaceConfigWithImage,
    };
  });

  return spaces ?? [];
}
