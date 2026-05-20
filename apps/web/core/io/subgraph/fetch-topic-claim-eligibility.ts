import { SystemIds } from '@geoprotocol/geo-sdk/lite';
import { Effect, Either } from 'effect';

import { TOPIC_TYPE_ID } from '~/core/constants';
import { Environment } from '~/core/environment';

import { graphql } from './graphql';

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
      types: relationsList(filter: { typeId: { is: ${JSON.stringify(SystemIds.TYPES_PROPERTY)} }, toEntityId: { is: ${JSON.stringify(TOPIC_TYPE_ID)} } }) {
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
