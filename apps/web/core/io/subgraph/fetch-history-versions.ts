import { Schema } from '@effect/schema';
import { Effect, Either } from 'effect';
import { v4 as uuid } from 'uuid';

import { Environment } from '~/core/environment';

import { HistoryVersionDto } from '../dto/versions';
import { SubstreamVersionHistorical } from '../schema';
import { fetchProfilesByAddresses } from './fetch-profiles-by-ids';
import { getEntityFragment } from './fragments';
import { graphql } from './graphql';

interface FetchVersionsArgs {
  entityId: string;
  page?: number;
  signal?: AbortSignal;
}

const query = (entityId: string) => {
  return `query {
    versions(filter: { entityId: {equalTo: ${JSON.stringify(entityId)}}} orderBy: CREATED_AT_DESC) {
      nodes {
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
    }
  }`;
};

interface NetworkResult {
  versions: { nodes: SubstreamVersionHistorical[] };
}

export async function fetchHistoryVersions(args: FetchVersionsArgs) {
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
  const profilesForProposals = await fetchProfilesByAddresses(networkVersions.map(p => p.edit.createdById));

  const versions = networkVersions
    .map(v => {
      const decoded = Schema.decodeEither(SubstreamVersionHistorical)(v);

      return Either.match(decoded, {
        onLeft: error => {
          console.error(`Could not decode version with id ${v.id} and entityId ${v.entityId}. ${String(error)}`);
          return null;
        },
        onRight: result => {
          const maybeProfile = profilesForProposals.find(profile => profile.address === result.edit.createdById);
          return HistoryVersionDto(result, maybeProfile);
        },
      });
    })
    .filter(d => d !== null);

  return versions;
}
