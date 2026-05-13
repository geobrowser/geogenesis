import { Effect, Either } from 'effect';

import { Environment } from '~/core/environment';

import { graphql } from './graphql';

// Keep these in sync with fetch-root-topics.ts.
const TYPES_PROPERTY_ID = '8f151ba4de204e3c9cb499ddf96f48f1';
const TOPIC_TYPE_ID = '5ef5a5860f274d8e8f6c59ae5b3e89e2';

export interface TopicClaimEligibility {
  isTopic: boolean;
  isClaimed: boolean;
  canClaim: boolean;
}

interface NetworkResult {
  entity: {
    types: Array<{ toEntityId: string }>;
    spacesByTopicIdConnection: { totalCount: number };
  } | null;
}

const buildQuery = (entityId: string) => `
  {
    entity(id: ${JSON.stringify(entityId)}) {
      types: relationsList(filter: { typeId: { is: ${JSON.stringify(TYPES_PROPERTY_ID)} }, toEntityId: { is: ${JSON.stringify(TOPIC_TYPE_ID)} } }) {
        toEntityId
      }
      spacesByTopicIdConnection {
        totalCount
      }
    }
  }
`;

/**
 * Returns claim eligibility for an entity.
 *
 *  - `isTopic`   — the entity is typed as Topic.
 *  - `isClaimed` — at least one space already has its `topicId` pointing here.
 *  - `canClaim`  — `isTopic && !isClaimed`. Drives whether the "Claim topic"
 *                  button renders on the entity page.
 */
export async function fetchTopicClaimEligibility(entityId: string): Promise<TopicClaimEligibility> {
  const queryEffect = graphql<NetworkResult>({
    query: buildQuery(entityId),
    endpoint: Environment.getConfig().api,
  });

  const resultOrError = await Effect.runPromise(Effect.either(queryEffect));

  if (Either.isLeft(resultOrError)) {
    const error = resultOrError.left;
    if (error._tag === 'AbortError') throw error;
    console.error(`${error._tag}: Unable to fetch topic claim eligibility for ${entityId}`);
    return { isTopic: false, isClaimed: false, canClaim: false };
  }

  const entity = resultOrError.right?.entity;
  const isTopic = (entity?.types?.length ?? 0) > 0;
  const isClaimed = (entity?.spacesByTopicIdConnection?.totalCount ?? 0) > 0;

  return {
    isTopic,
    isClaimed,
    canClaim: isTopic && !isClaimed,
  };
}
