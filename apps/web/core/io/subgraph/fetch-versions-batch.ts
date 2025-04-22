import { Schema } from '@effect/schema';
import { Effect, Either } from 'effect';
import { v4 as uuid } from 'uuid';

import { Environment } from '~/core/environment';

import { HistoryVersionDto } from '../dto/versions';
import { SubstreamVersionHistorical } from '../schema';
import { getEntityFragment } from './fragments';
import { graphql } from './graphql';

interface FetchVersionsArgs {
  versionIds: string[];
  page?: number;
  signal?: AbortSignal;
}

const query = (versionIds: string[]) => {
  return `query {
    versions(filter: { id: { in: ${JSON.stringify(versionIds)} } } first: 50) {
    nodes {
        ${getEntityFragment()}
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

export async function fetchHistoricalVersionsBatch(args: FetchVersionsArgs) {
  const queryId = uuid();
  const endpoint = Environment.getConfig().api;

  const graphqlFetchEffect = graphql<NetworkResult>({
    endpoint,
    query: query(args.versionIds),
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
                args.versionIds
              }

                queryString: ${query(args.versionIds)}
                `,
              error.message
            );

            return [];
          default:
            console.error(
              `${error._tag}: Unable to fetch version, queryId: ${queryId} endpoint: ${endpoint} id: ${args.versionIds}`
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

  return networkVersions
    .map(networkVersion => {
      const decoded = Schema.decodeEither(SubstreamVersionHistorical)(networkVersion);

      return Either.match(decoded, {
        onLeft: error => {
          console.error(
            `FetchVersionsBatch: Could not decode version with id ${networkVersion.id} and entityId ${networkVersion.entityId}. ${String(
              error
            )}`
          );
          return null;
        },
        onRight: result => {
          return HistoryVersionDto(result);
        },
      });
    })
    .filter(v => v !== null);
}
