'use client';

import { Schema } from '@effect/schema';
import { useQuery } from '@tanstack/react-query';
import { Effect, Either } from 'effect';

import { useState } from 'react';

import { Environment } from '~/core/environment';
import { useDebouncedValue } from '~/core/hooks/use-debounced-value';
import { SubstreamSpace, SubstreamSpaceEntityConfig } from '~/core/io/schema';
import { spaceMetadataFragment } from '~/core/io/subgraph/fragments';
import { graphql } from '~/core/io/subgraph/graphql';

import { SpaceMetadataDto } from '../io/dto/spaces';

type NetworkResult = {
  spaces: {
    nodes: Array<Pick<SubstreamSpace, 'spacesMetadata' | 'id'>>;
  };
};

const spacesQuery = (name: string) => `
  {
    spaces(
      filter: { spacesMetadata: { some: { entity: { currentVersion: { version: { name: { includesInsensitive: "${name}" } } } } } } } 
      first: 10
    ) {
      nodes {
        id
        spacesMetadata {
          nodes {
            entity {
              id
              currentVersion {
                version {
                  ${spaceMetadataFragment}
                }
              }
            }
          }
        }
      }
    }
  }
`;

export function useSpacesQuery() {
  const [query, setQuery] = useState('');
  const debouncedQuery = useDebouncedValue(query, 200);

  const { data } = useQuery({
    queryKey: ['spaces-by-name', debouncedQuery],
    queryFn: async ({ signal }) => {
      const queryEffect = graphql<NetworkResult>({
        query: spacesQuery(query),
        endpoint: Environment.getConfig().api,
        signal,
      });

      const resultOrError = await Effect.runPromise(Effect.either(queryEffect));

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
              `Encountered runtime graphql error in spaces-by-name.

              queryString: ${spacesQuery(query)}
              `,
              error.message
            );

            return {
              spaces: {
                nodes: [],
              },
            };

          default:
            console.error(`${error._tag}: Unable to fetch spaces in spaces-by-name`);

            return {
              spaces: {
                nodes: [],
              },
            };
        }
      }

      return resultOrError.right;
    },
  });

  if (!data) {
    return {
      query,
      setQuery,
      spaces: [],
    };
  }

  const spaceConfigEntities = data.spaces.nodes
    .map(space => {
      const decodedSpace = Schema.decodeEither(SubstreamSpaceEntityConfig)(space);

      return Either.match(decodedSpace, {
        onLeft: error => {
          console.error(`Unable to decode space entity config: ${String(error)}`);
          return null;
        },
        onRight: space => {
          return SpaceMetadataDto(space.id, space.spacesMetadata.nodes[0]?.entity);
        },
      });
    })
    .filter(space => space !== null);

  return {
    query,
    setQuery,
    spaces: spaceConfigEntities,
  };
}
