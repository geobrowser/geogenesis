'use client';

import { useQuery } from '@tanstack/react-query';
import { Effect, Either } from 'effect';

import { useState } from 'react';

import { Environment } from '~/core/environment';
import { useDebouncedValue } from '~/core/hooks/use-debounced-value';
import { graphql } from '~/core/io/subgraph/graphql';

import { SpaceDto } from '../io/dto/spaces';
import { RemoteSpace } from '../io/v2/v2.schema';

type NetworkResult = {
  spaces: Array<RemoteSpace>;
};

const mainSpacesIds = JSON.stringify([
  'b2565802-3118-47be-91f2-e59170735bac',
  'b42fa1af-1d67-4058-a6f1-4be5d7360caf',
  'dabe3133-4334-47a0-85c5-f965a3a94d4c',
]);

// @TODO: Support filtering by page name
const spacesQuery = (name: string) => `
  {
    spaces(
      filter : 
        {id: 
          {in: ${mainSpacesIds}}
        }
    ) {
      id
      type
      daoAddress
      spaceAddress
      mainVotingAddress
      membershipAddress
      personalAddress

      membersList {
        address
      }

      editorsList {
        address
      }

      page  {
        id
        name
        description
        spaceIds

        types {
          id
          name
        }

        valuesList {
          spaceId
          property {
            id
            name
            dataType
            renderableType
            relationValueTypes {
              id
              name
            }
          }
          value
          language
          unit
        }

        relationsList {
          id
          spaceId
          position
          verified
          entityId

          fromEntity {
            id
            name
          }

          toEntity {
            id
            name
            types {
              id
              name
            }
            valuesList {
              propertyId
              value
            }
          }

          toSpaceId

          type {
            id
            name
            renderableType
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
        query: spacesQuery(debouncedQuery),
        endpoint: Environment.getConfig().api,
        signal,
      });

      const resultOrError = await Effect.runPromise(Effect.either(queryEffect));

      if (Either.isLeft(resultOrError)) {
        console.log(resultOrError);
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
              spaces: [],
            };

          default:
            console.error(`${error._tag}: Unable to fetch spaces in spaces-by-name`);

            return {
              spaces: [],
            };
        }
      }

      return {
        spaces: resultOrError.right.spaces
          .map(rSpace => SpaceDto(rSpace))
          .filter(item => item.entity.name?.toLowerCase().includes(debouncedQuery.toLowerCase())),
      };
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
    spaces: data.spaces,
  };
}
