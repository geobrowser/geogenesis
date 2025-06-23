'use client';

import { useQuery } from '@tanstack/react-query';
import { Effect, Either } from 'effect';

import { useState } from 'react';

import { Environment } from '~/core/environment';
import { useDebouncedValue } from '~/core/hooks/use-debounced-value';
import { SubstreamSpace } from '~/core/io/schema';
import { spaceMetadataFragment } from '~/core/io/subgraph/fragments';
import { graphql } from '~/core/io/subgraph/graphql';

type NetworkResult = {
  spaces: {
    nodes: Array<Pick<SubstreamSpace, 'spacesMetadatum' | 'id'>>;
  };
};

const spacesQuery = (name: string) => `
  {
    spaces(
      filter: { spacesMetadatum: { version: { name: { includesInsensitive: "${name}" } } } }
      first: 10
    ) {
      nodes {
        id
        ${spaceMetadataFragment}
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

  return {
    query,
    setQuery,
    // @TODO(migration): Query for spaces by name
    spaces: [],
  };
}
