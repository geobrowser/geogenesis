import { Schema } from '@effect/schema';
import { Effect, Either } from 'effect';
import { v4 as uuid } from 'uuid';

import { Environment } from '~/core/environment';

import { VersionDto } from '../dto/versions';
import { SubstreamVersion } from '../schema';
import { versionFragment } from './fragments';
import { graphql } from './graphql';

interface FetchVersionsArgs {
  entityId: string;
  page?: number;
  signal?: AbortSignal;
}

const PAGE_SIZE = 5;

const query = (entityId: string, page = 0) => {
  return `query {
    versions(filter: { entityId: {equalTo: ${JSON.stringify(entityId)}}}) {
      nodes {
        ${versionFragment}
        edit {
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

export async function fetchVersions(args: FetchVersionsArgs) {
  const queryId = uuid();
  const endpoint = Environment.getConfig().api;

  const graphqlFetchEffect = graphql<NetworkResult>({
    endpoint,
    query: query(args.entityId),
    signal: args.signal,
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
              `Encountered runtime graphql error in fetchVersions. queryId: ${queryId} endpoint: ${endpoint} id: ${
                args.entityId
              }

                queryString: ${query(args.entityId)}
                `,
              error.message
            );

            return [];
          default:
            console.error(
              `${error._tag}: Unable to fetch versions, queryId: ${queryId} endpoint: ${endpoint} id: ${args.entityId}`
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

  const versions = networkVersions
    .map(v => {
      const decoded = Schema.decodeEither(SubstreamVersion)(v);

      return Either.match(decoded, {
        onLeft: error => {
          console.error(`Could not decode version with id ${v.id} and entityId ${v.entityId}. ${String(error)}`);
          return null;
        },
        onRight: result => {
          return VersionDto(result);
        },
      });
    })
    .filter(d => d !== null);

  return versions;
}
