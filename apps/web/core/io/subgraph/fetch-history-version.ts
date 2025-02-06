import { Schema } from '@effect/schema';
import { Effect, Either } from 'effect';
import { v4 as uuid } from 'uuid';

import { Environment } from '~/core/environment';

import { HistoryVersionDto } from '../dto/versions';
import { SubstreamVersionHistorical } from '../schema';
import { getEntityFragment } from './fragments';
import { graphql } from './graphql';

interface FetchVersionsArgs {
  versionId: string;
  page?: number;
  signal?: AbortSignal;
}

const query = (versionId: string) => {
  return `query {
    version(id: "${versionId}") {
      ${getEntityFragment({ useHistorical: true })}
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
  }`;
};

interface NetworkResult {
  version: SubstreamVersionHistorical | null;
}

export async function fetchHistoryVersion(args: FetchVersionsArgs) {
  const queryId = uuid();
  const endpoint = Environment.getConfig().api;

  const graphqlFetchEffect = graphql<NetworkResult>({
    endpoint,
    query: query(args.versionId),
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
              `Encountered runtime graphql error in fetchVersion. queryId: ${queryId} endpoint: ${endpoint} id: ${
                args.versionId
              }

                queryString: ${query(args.versionId)}
                `,
              error.message
            );

            return null;
          default:
            console.error(
              `${error._tag}: Unable to fetch version, queryId: ${queryId} endpoint: ${endpoint} id: ${args.versionId}`
            );
            return null;
        }
      },
      onRight: result => {
        return result.version;
      },
    });
  });

  const networkVersion = await Effect.runPromise(withFallbacks);

  if (!networkVersion) {
    return null;
  }

  const decoded = Schema.decodeEither(SubstreamVersionHistorical)(networkVersion);

  return Either.match(decoded, {
    onLeft: error => {
      console.error(
        `Could not decode version with id ${networkVersion.id} and entityId ${networkVersion.entityId}. ${String(
          error
        )}`
      );
      return null;
    },
    onRight: result => {
      return HistoryVersionDto(result);
    },
  });
}
