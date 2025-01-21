import { Schema } from '@effect/schema';
import { Effect, Either } from 'effect';
import { v4 as uuid } from 'uuid';

import { Environment } from '~/core/environment';
import { VersionDto } from '~/core/io/dto/versions';
import { SubstreamVersion } from '~/core/io/schema';
import { getEntityFragment } from '~/core/io/subgraph/fragments';
import { graphql } from '~/core/io/subgraph/graphql';

interface FetchVersionsArgs {
  createdAt: number;
  entityId: string;
  spaceId: string;
}

const query = (createdAt: number, entityId: string, spaceId: string) => {
  return `query {
    versions(filter: {
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
        }
      }
    }
  }`;
};

interface NetworkResult {
  versions: { nodes: SubstreamVersion[] };
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
  const decoded = Schema.decodeEither(SubstreamVersion)(latestVersion);

  return Either.match(decoded, {
    onLeft: error => {
      console.error(
        `Could not decode version with id ${latestVersion.id} and entityId ${latestVersion.entityId} less than ${
          args.createdAt
        }. ${String(error)}`
      );
      return null;
    },
    onRight: result => {
      return VersionDto(result);
    },
  });
}
