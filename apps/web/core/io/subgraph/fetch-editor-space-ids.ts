import * as Effect from 'effect/Effect';
import * as Either from 'effect/Either';

import { Environment } from '~/core/environment';

import { graphql } from './graphql';

type EditorSpacesResult = {
  spacesConnection: {
    nodes: { id: string }[];
  };
};

export async function fetchEditorSpaceIds(memberSpaceId: string): Promise<string[]> {
  const query = `query {
    spacesConnection(
      filter: {
        editors: {
          some: {
            memberSpaceId: { is: "${memberSpaceId}" }
          }
        }
      }
    ) {
      nodes {
        id
      }
    }
  }`;

  const fetchEffect = graphql<EditorSpacesResult>({
    endpoint: Environment.getConfig().api,
    query,
  });

  const result = await Effect.runPromise(Effect.either(fetchEffect));

  if (Either.isLeft(result)) {
    console.error('Failed to fetch editor spaces:', result.left);
    return [];
  }

  return result.right.spacesConnection.nodes.map(n => n.id).filter(id => id !== memberSpaceId);
}
