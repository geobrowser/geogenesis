import { Effect, Either } from 'effect';

import { Environment } from '~/core/environment';
import { validateSpaceId } from '~/core/utils/utils';

import { graphql } from './graphql';

interface SpaceVerificationResult {
  subspaces: Array<{ childSpaceId: string }>;
}

const spaceVerificationQuery = (parentSpaceId: string, childSpaceId: string) => `
  {
    subspaces(
      filter: {
        parentSpaceId: { is: ${JSON.stringify(parentSpaceId)} }
        childSpaceId: { is: ${JSON.stringify(childSpaceId)} }
        type: { in: [VERIFIED] }
      }
    ) {
      childSpaceId
    }
  }
`;

export async function fetchSpaceVerification(parentSpaceId: string, childSpaceId: string): Promise<boolean> {
  if (!validateSpaceId(parentSpaceId) || !validateSpaceId(childSpaceId)) {
    throw new Error('Invalid space ID provided for verification fetch');
  }

  const result = await Effect.runPromise(
    Effect.either(
      graphql<SpaceVerificationResult>({
        query: spaceVerificationQuery(parentSpaceId, childSpaceId),
        endpoint: Environment.getConfig().api,
      })
    )
  );

  if (Either.isLeft(result)) {
    const error = result.left;

    if (error._tag === 'AbortError') {
      throw error;
    }

    console.error(`${error._tag}: Unable to fetch verification from space ${parentSpaceId} to space ${childSpaceId}`);
    throw new Error('Failed to fetch space verification');
  }

  return result.right.subspaces.length > 0;
}
