import { Schema } from 'effect';
import { Effect, Either } from 'effect';
import { v4 as uuid } from 'uuid';

import { Environment } from '~/core/environment';
import { HistoryVersionDto } from '~/core/io/dto/versions';
import { SubstreamVersionHistorical } from '~/core/io/substream-schema';
import { getEntityFragment } from '~/core/io/subgraph/fragments';
import { graphql } from '~/core/io/subgraph/graphql';

interface FetchVersionsArgs {
  editId: string;
  spaceId: string;
}

const query = (editId: string, spaceId: string) => {
  return `query {
    versions(filter: { editId: {equalTo: ${JSON.stringify(editId)}}} first: 50) {
      nodes {
        ${getEntityFragment({ spaceId, useHistorical: true })}
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

export async function fetchVersionsByEditId(args: FetchVersionsArgs) {
  const queryId = uuid();
  const endpoint = Environment.getConfig().api;

  const graphqlFetchEffect = graphql<NetworkResult>({
    endpoint,
    query: query(args.editId, args.spaceId),
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
                args.editId
              }

                queryString: ${query(args.editId, args.spaceId)}
                `,
              error.message
            );

            return [];
          default:
            console.error(
              `${error._tag}: Unable to fetch versions, queryId: ${queryId} endpoint: ${endpoint} id: ${args.editId}`
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
      const decoded = Schema.decodeEither(SubstreamVersionHistorical)(v);

      return Either.match(decoded, {
        onLeft: error => {
          console.error(
            `FetchVersionsByEditId: Could not decode version with id ${v.id} and entityId ${v.entityId}. ${String(error)}`
          );
          return null;
        },
        onRight: result => {
          return HistoryVersionDto(result);
        },
      });
    })
    .filter(d => d !== null);

  return versions;
}
