import { Effect } from 'effect';
import { v4 as uuid } from 'uuid';

import { ProposedVersion } from '~/core/types';

import { fetchProfile } from './fetch-profile';
import { graphql } from './graphql';
import { NetworkProposedVersion } from './network-local-mapping';

export const getProposedVersionQuery = (id: string) => `query {
  proposedVersion(id: ${JSON.stringify(id)}) {
    id
    name
    createdAt
    createdAtBlock
    createdBy {
      id
    }
    actions {
      actionType
      id
      attribute {
        id
        name
      }
      entity {
        id
        name
      }
      entityValue {
        id
        name
      }
      numberValue
      stringValue
      valueType
      valueId
    }
    entity {
      id
      name
    }
  }
}`;

export interface FetchProposedVersionOptions {
  endpoint: string;
  id: string;
  abortController?: AbortController;
}

interface NetworkResult {
  data: { proposedVersion: NetworkProposedVersion | null };
  errors: unknown[];
}

export async function fetchProposedVersion({
  endpoint,
  id,
  abortController,
}: FetchProposedVersionOptions): Promise<ProposedVersion | null> {
  const queryId = uuid();

  const graphqlFetchEffect = graphql<NetworkResult>({
    endpoint: endpoint,
    query: getProposedVersionQuery(id),
    abortController: abortController,
  });

  // @TODO: Catch by known tag and unexpected errors
  // retries
  const graphqlFetchEffectWithErrorHandling = graphqlFetchEffect.pipe(
    Effect.catchAll(() => {
      console.error(`Unable to fetch proposedVersion. queryId: ${queryId} id: ${id} endpoint: ${endpoint}`);
      return Effect.succeed({
        data: {
          proposedVersion: null,
        },
        errors: [],
      });
    })
  );

  const result = await Effect.runPromise(graphqlFetchEffectWithErrorHandling);

  // @TODO: Fallback
  // @TODO: runtime validation of types
  // @TODO: log fail states
  if (result.errors?.length > 0) {
    console.error(
      `Encountered runtime graphql error in proposedVersion. queryId: ${queryId} id: ${id} endpoint: ${endpoint}
      
      queryString: ${getProposedVersionQuery(id)}
      `,
      result.errors
    );
    return null;
  }

  const proposedVersion = result.data.proposedVersion;

  if (!proposedVersion) {
    return null;
  }

  const maybeProfile = await fetchProfile({ address: proposedVersion.createdBy.id, endpoint });

  return {
    ...proposedVersion,
    createdBy: maybeProfile !== null ? maybeProfile[1] : proposedVersion.createdBy,
  };
}
