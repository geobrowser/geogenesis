import { Schema } from 'effect';
import { Effect, Either } from 'effect';
import { v4 as uuid } from 'uuid';

import { Environment } from '~/core/environment';
import { HistoryVersionDto } from '~/core/io/dto/versions';
import { getEntityFragment } from '~/core/io/subgraph/fragments';
import { graphql } from '~/core/io/subgraph/graphql';
import { SubstreamVersionHistorical } from '~/core/io/substream-schema';

interface FetchVersionsArgs {
  createdAt: number;
  entityId: string;
  spaceId: string;
}

const query = (createdAt: number, entityId: string, spaceId: string) => {
  return `query {
    versions(orderBy: CREATED_AT_DESC, first: 1, filter: {
        entityId: { equalTo: "${entityId}"}
        createdAt: {lessThan: ${createdAt}}
        edit: { spaceId: { equalTo: "${spaceId}" } proposals: { some: { status: { equalTo: ACCEPTED } } } }
      }
    ) {
      nodes {
        ${getEntityFragment({ useHistorical: true, spaceId })}
        edit {
          id
          name
          createdAt
          createdById
          proposals {
            nodes {
              id
            }
          }
        }
      }
    }
  }`;
};

interface NetworkResult {
  versions: { nodes: SubstreamVersionHistorical[] };
}

export async function fetchPreviousVersionByCreatedAt(args: FetchVersionsArgs) {
  const queryId = uuid();
  const endpoint = Environment.getConfig().api;

  const graphqlFetchEffect = graphql<NetworkResult>({
    endpoint,
    query: query(args.createdAt, args.entityId, args.spaceId),
  });

  const withFallbacks = Effect.gen(function* () {
    const queryResult = yield* Effect.either(graphqlFetchEffect);

    return Either.match(queryResult, {
      onLeft: error => {
        switch (error._tag) {
          case 'AbortError':
            throw error;
          case 'GraphqlRuntimeError':
            console.error(
              `Encountered runtime graphql error in fetchPreviousVersionByCreatedAt. queryId: ${queryId} endpoint: ${endpoint} id: ${
                args.entityId
              }

                queryString: ${query(args.createdAt, args.entityId, args.spaceId)}
                `,
              error.message
            );

            return [];
          default:
            console.error(
              `${error._tag}: Unable to fetch fetchPreviousVersionByCreatedAt, queryId: ${queryId} endpoint: ${endpoint} id: ${args.entityId}`
            );
            return [];
        }
      },
      onRight: result => {
        return result.versions.nodes;
      },
    });
  });

  const networkVersions = await Effect.runPromise(withFallbacks);

  if (networkVersions.length === 0) {
    return null;
  }

  const latestVersion = networkVersions[0];

  const decoded = Schema.decodeEither(SubstreamVersionHistorical)(latestVersion);

  return Either.match(decoded, {
    onLeft: error => {
      console.error(
        `FetchPreviousVersionByCreatedAt: Could not decode version with id ${latestVersion.id} and entityId ${latestVersion.entityId} less than ${
          args.createdAt
        }. ${String(error)}`
      );
      return null;
    },
    onRight: result => {
      return HistoryVersionDto(result);
    },
  });
}
