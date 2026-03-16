import { Effect, Either } from 'effect';

import { Environment } from '~/core/environment';
import { validateSpaceId } from '~/core/utils/utils';

import { graphql } from './graphql';

interface SubtopicNode {
  topicId: string;
  topic: {
    name: string | null;
  } | null;
}

interface NetworkResult {
  subspaceTopicsConnection: {
    nodes: SubtopicNode[];
  };
}

export interface Subtopic {
  id: string;
  name: string;
}

const subtopicsQuery = (spaceId: string) => `
  {
    subspaceTopicsConnection(filter: { spaceId: { is: ${JSON.stringify(spaceId)} } }) {
      nodes {
        topicId
        topic {
          name
        }
      }
    }
  }
`;

export async function fetchSubtopics(spaceId: string): Promise<Subtopic[]> {
  if (!validateSpaceId(spaceId)) {
    throw new Error(`Invalid space ID provided for subtopics fetch: ${spaceId}`);
  }

  const queryEffect = graphql<NetworkResult>({
    query: subtopicsQuery(spaceId),
    endpoint: Environment.getConfig().api,
  });

  const resultOrError = await Effect.runPromise(Effect.either(queryEffect));

  if (Either.isLeft(resultOrError)) {
    const error = resultOrError.left;

    switch (error._tag) {
      case 'AbortError':
        throw error;
      default:
        console.error(`${error._tag}: Unable to fetch subtopics for space ${spaceId}`);
        throw new Error(`Failed to fetch subtopics for space ${spaceId}`);
    }
  }

  const nodes = resultOrError.right.subspaceTopicsConnection.nodes;

  return nodes.map(node => ({
    id: node.topicId,
    name: node.topic?.name ?? 'Untitled',
  }));
}
