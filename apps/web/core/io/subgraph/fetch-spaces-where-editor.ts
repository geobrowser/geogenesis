import { Schema } from '@effect/schema';
import * as Effect from 'effect/Effect';
import * as Either from 'effect/Either';
import { v4 as uuid } from 'uuid';

import { Environment } from '~/core/environment';

import { SpaceConfigEntity, SpaceEntityDto } from '../dto/spaces';
import { SpaceId, SubstreamVersion } from '../schema';
import { spaceMetadataFragment } from './fragments';
import { graphql } from './graphql';

const getFetchSpacesWhereEditorQuery = (address: string) => `query {
  spaces(filter: { spaceEditors: { some: { accountId: { equalTo: "${address}" } } } }) {
    nodes {
      id
      ${spaceMetadataFragment}
    }
  }
}`;

interface NetworkResult {
  spaces: {
    nodes: {
      id: string;
      spacesMetadatum: { version: SubstreamVersion };
    }[];
  };
}

export async function fetchSpacesWhereEditor(address: string): Promise<SpaceWhereEditor[]> {
  const queryId = uuid();
  const endpoint = Environment.getConfig().api;

  const graphqlFetchEffect = graphql<NetworkResult>({
    endpoint,
    query: getFetchSpacesWhereEditorQuery(address),
  });

  const graphqlFetchWithErrorFallbacks = Effect.gen(function* (awaited) {
    const resultOrError = yield* awaited(Effect.either(graphqlFetchEffect));

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
            `Encountered runtime graphql error in fetchSpacesWhereEditor. queryId: ${queryId} endpoint: ${endpoint}

            queryString: ${getFetchSpacesWhereEditorQuery(address)}
            `,
            error.message
          );

          return {
            spaces: {
              nodes: [],
            },
          };

        default:
          console.error(`${error._tag}: Unable to fetch spaces for editor, queryId: ${queryId} endpoint: ${endpoint}`);

          return {
            spaces: {
              nodes: [],
            },
          };
      }
    }

    return resultOrError.right;
  });

  const result = await Effect.runPromise(graphqlFetchWithErrorFallbacks);

  const spaces = result.spaces.nodes
    .map(space => {
      const decodedSpace = Schema.decodeEither(SpaceWhereEditorSchema)(space);

      return Either.match(decodedSpace, {
        onLeft: error => {
          console.error(`Encountered error decoding space where editor. spaceId: ${space.id} error: ${error}`);
          return null;
        },
        onRight: space => {
          return SpaceWhereEditorDto(space);
        },
      });
    })
    .filter(s => s !== null);

  // Only return spaces that have a spaceConfig. We'll eventually be able to do this at
  // the query level when we index the space config entity as part of a Space.
  return spaces.flatMap(s => (s.spaceConfig ? [s] : []));
}

const SpaceWhereEditorSchema = Schema.Struct({
  id: Schema.String.pipe(Schema.length(22), Schema.fromBrand(SpaceId)),
  spacesMetadatum: Schema.NullOr(Schema.Struct({ version: SubstreamVersion })),
});

type SpaceWhereEditorSchema = Schema.Schema.Type<typeof SpaceWhereEditorSchema>;

type SpaceWhereEditor = {
  id: SpaceId;
  spaceConfig: SpaceConfigEntity;
};

function SpaceWhereEditorDto(space: SpaceWhereEditorSchema) {
  const spaceConfigWithImage = SpaceEntityDto(space.id, space.spacesMetadatum?.version);

  return {
    id: space.id,
    spaceConfig: spaceConfigWithImage,
  };
}
