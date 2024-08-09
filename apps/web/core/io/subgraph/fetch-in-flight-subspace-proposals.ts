import { Schema } from '@effect/schema';
import { Effect, Either } from 'effect';

import { Environment } from '~/core/environment';
import { GeoDate } from '~/core/utils/utils';

import { Subspace, SubspaceDto } from '../dto/subspaces';
import { SubstreamSubspace } from '../schema';
import { spaceMetadataFragment } from './fragments';
import { graphql } from './graphql';

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
          spaceBySubspace: SubstreamSubspace;
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

  const spaces = subspaces
    ?.map((spaceBySubspace): Subspace | null => {
      const decodedSpace = Schema.decodeEither(SubstreamSubspace)(spaceBySubspace.spaceBySubspace);

      const result = Either.match(decodedSpace, {
        onLeft: error => {
          console.error(`Encountered error decoding proposed subspace for space with id ${spaceId} – error: ${error}`);
          return null;
        },
        onRight: space => {
          return space;
        },
      });

      if (result === null) {
        return null;
      }

      return SubspaceDto(result);
    })
    .filter(s => s !== null);

  return spaces ?? [];
}
