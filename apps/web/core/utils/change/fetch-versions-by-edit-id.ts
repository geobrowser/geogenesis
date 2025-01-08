import { Schema } from '@effect/schema';
import { Effect, Either } from 'effect';
import { v4 as uuid } from 'uuid';

import { Environment } from '~/core/environment';
import { VersionDto } from '~/core/io/dto/versions';
import { SubstreamVersion } from '~/core/io/schema';
import { versionFragment } from '~/core/io/subgraph/fragments';
import { graphql } from '~/core/io/subgraph/graphql';

interface FetchVersionsArgs {
  editId: string;
}

const query = (editId: string) => {
  return `query {
    versions(filter: { editId: {equalTo: ${JSON.stringify(editId)}}}) {
      nodes {
        ${versionFragment}
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

export async function fetchVersionsByEditId(args: FetchVersionsArgs) {
  const queryId = uuid();
  const endpoint = Environment.getConfig().api;

  const graphqlFetchEffect = graphql<NetworkResult>({
    endpoint,
    query: query(args.editId),
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

                queryString: ${query(args.editId)}
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
