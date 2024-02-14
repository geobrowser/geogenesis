'use client';

import { useQuery } from '@tanstack/react-query';

import { useAccount } from 'wagmi';

import { useHydrated } from './use-hydrated';
import { graphql } from '../io/subgraph/graphql';
import { Environment } from '../environment';
import { Effect, Either } from 'effect';
import { isPermissionlessSpace } from '../utils/utils';
import { Subgraph } from '../io';

const getQuery = (spaceId: string) => `
  {
    space(id: "${spaceId}") {
      editors {
        id
      }
      editorControllers {
        id
      }
      admins {
        id
      }
    }
  }
`;

type NetworkResult = {
  space: {
    admins: { id: string }[];
    editors: { id: string }[];
    editorControllers: { id: string }[];
  } | null;
};

/**
 * Right now there is a bug in the substream where some GrantRole and RevokeRole events are not
 * being emitted as expected. For now we use the subgraphs for role fetching and access control
 * until that is fixed.
 */
async function fetchSpaceLegacy(spaceId: string) {
  const endpoint = isPermissionlessSpace(spaceId)
    ? Environment.getConfig(process.env.NEXT_PUBLIC_APP_ENV).permissionlessSubgraph
    : Environment.getConfig(process.env.NEXT_PUBLIC_APP_ENV).subgraph;

  const graphqlFetchEffect = graphql<NetworkResult>({
    endpoint,
    query: getQuery(spaceId),
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
            `Encountered runtime graphql error in fetchSpace. spaceId: ${spaceId} endpoint: ${endpoint}

            queryString: ${getQuery(spaceId)}
            `,
            error.message
          );

          return {
            space: null,
          };

        default:
          console.error(`${error._tag}: Unable to fetch space,spaceId: ${spaceId} endpoint: ${endpoint}`);

          return {
            space: null,
          };
      }
    }

    return resultOrError.right;
  });

  const result = await Effect.runPromise(graphqlFetchWithErrorFallbacks);

  if (!result.space) {
    return null;
  }

  return {
    admins: result.space.admins.map(a => a.id),
    editors: result.space.editors.map(e => e.id),
    editorControllers: result.space.editorControllers.map(ec => ec.id),
  };
}

export function useAccessControl(spaceId?: string | null) {
  // We need to wait for the client to check the status of the client-side wallet
  // before setting state. Otherwise there will be client-server hydration mismatches.
  const hydrated = useHydrated();
  const { address } = useAccount();

  const { data: space } = useQuery({
    queryKey: ['access-control', spaceId, address],
    queryFn: async () => {
      if (!spaceId || !address) return null;

      /**
       * Right now there is a bug in the substream where some GrantRole and RevokeRole events are not
       * being emitted as expected. For now we use the subgraphs for role fetching and access control
       * in public spaces until that is fixed or we migrate to the new governance contracts.
       */
      return isPermissionlessSpace(spaceId)
        ? await Subgraph.fetchSpace({ id: spaceId })
        : await fetchSpaceLegacy(spaceId);
    },
  });

  // if (process.env.NODE_ENV === 'development') {
  //   return {
  //     isAdmin: true,
  //     isEditorController: true,
  //     isEditor: true,
  //   };
  // }

  if (!address || !hydrated || !space) {
    return {
      isAdmin: false,
      isEditorController: false,
      isEditor: false,
    };
  }

  return {
    isAdmin: space.admins.map(s => s.toLowerCase()).includes(address.toLowerCase()),
    isEditorController: space.editorControllers.map(s => s.toLowerCase()).includes(address.toLowerCase()),
    isEditor: space.editors.map(s => s.toLowerCase()).includes(address.toLowerCase()),
  };
}
