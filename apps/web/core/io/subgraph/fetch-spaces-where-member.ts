import { Schema } from 'effect';
import * as Effect from 'effect/Effect';
import * as Either from 'effect/Either';
import { v4 as uuid } from 'uuid';

import { Environment } from '~/core/environment';
import { SpaceEntity } from '~/core/v2.types';

import { SpaceEntityDto } from '../dto/spaces';
import { SubstreamVersion } from '../schema';
import { Entity } from '../v2/v2.schema';
import { spaceMetadataFragment } from './fragments';
import { graphql } from './graphql';

const getFetchSpacesWhereMemberQuery = (address: string) => `query {
  spaces(filter: { spaceMembers: { some: { accountId: { equalTo: "${address}" } } } }) {
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
      spacesMetadatum: {
        version: SubstreamVersion;
      };
    }[];
  };
}

export async function fetchSpacesWhereMember(address?: string): Promise<SpaceWhereMember[]> {
  if (!address) {
    return [];
  }

  const queryId = uuid();
  const endpoint = Environment.getConfig().api;

  const graphqlFetchEffect = graphql<NetworkResult>({
    endpoint,
    query: getFetchSpacesWhereMemberQuery(address),
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
            `Encountered runtime graphql error in fetchSpacesWhereMember. queryId: ${queryId} endpoint: ${endpoint}

            queryString: ${getFetchSpacesWhereMemberQuery(address)}
            `,
            error.message
          );

          return {
            spaces: {
              nodes: [],
            },
          };

        default:
          console.error(`${error._tag}: Unable to fetch spaces for member, queryId: ${queryId} endpoint: ${endpoint}`);

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
      const decodedSpace = Schema.decodeEither(SpaceWhereMemberSchema)(space);

      return Either.match(decodedSpace, {
        onLeft: error => {
          console.error(`Encountered error decoding space where member. spaceId: ${space.id} error: ${error}`);
          return null;
        },
        onRight: space => {
          return SpaceWhereMemberDto(space);
        },
      });
    })
    .filter(s => s !== null);

  // Only return spaces that have a spaceConfig. We'll eventually be able to do this at
  // the query level when we index the space config entity as part of a Space.
  return spaces.flatMap(s => (s.spaceEntity ? [s] : []));
}

const SpaceWhereMemberSchema = Schema.Struct({
  id: Schema.String,
  entity: Schema.NullOr(Entity),
});

type SpaceWhereMemberSchema = Schema.Schema.Type<typeof SpaceWhereMemberSchema>;

export type SpaceWhereMember = {
  id: string;
  entity: SpaceEntity;
};

function SpaceWhereMemberDto(space: SpaceWhereMemberSchema) {
  const spaceEntity = SpaceEntityDto(space.id, space.entity);

  return {
    id: space.id,
    spaceEntity: spaceEntity,
  };
}
