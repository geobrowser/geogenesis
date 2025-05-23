import { Schema } from '@effect/schema';
import * as Effect from 'effect/Effect';
import * as Either from 'effect/Either';

import { Environment } from '~/core/environment';

import { Space, SpaceDto } from '../dto/spaces';
import { SubstreamSpace } from '../schema';
import { getSpaceFragment } from './fragments';
import { graphql } from './graphql';

const getFetchSpaceQuery = (id: string) => `query {
  space(id: "${id}") {
    ${getSpaceFragment(id)}
  }
}`;

export interface FetchSpaceOptions {
  id: string;
}

type NetworkResult = {
  space: SubstreamSpace | null;
};

export async function fetchSpace(options: FetchSpaceOptions): Promise<Space | null> {
  const endpoint = Environment.getConfig().api;

  const graphqlFetchEffect = graphql<NetworkResult>({
    endpoint,
    query: getFetchSpaceQuery(options.id),
  });

  const graphqlFetchWithErrorFallbacks = Effect.gen(function* () {
    const resultOrError = yield* Effect.either(graphqlFetchEffect);

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
            `Encountered runtime graphql error in fetchSpace. spaceId: ${options.id} endpoint: ${endpoint}

            queryString: ${getFetchSpaceQuery(options.id)}
            `,
            String(error)
          );

          return {
            space: null,
          };

        default:
          console.error(
            `${error._tag}: Unable to fetch space, spaceId: ${options.id} endpoint: ${endpoint}. ${String(error)}`
          );

          return {
            space: null,
          };
      }
    }

    return resultOrError.right;
  });

  const result = await Effect.runPromise(graphqlFetchWithErrorFallbacks);

  if (!result) {
    return null;
  }

  if (!result.space) {
    return null;
  }

  const networkSpace = result.space;
  const spaceOrError = Schema.decodeEither(SubstreamSpace)(networkSpace);

  const decodedSpace = Either.match(spaceOrError, {
    onLeft: error => {
      console.error(`Unable to decode space ${networkSpace.id} with error ${error}`);
      return null;
    },
    onRight: space => {
      return space;
    },
  });

  if (decodedSpace === null) {
    return null;
  }

  return SpaceDto(networkSpace as SubstreamSpace);
}
