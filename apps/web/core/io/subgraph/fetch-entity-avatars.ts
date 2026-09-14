import { Effect, Either } from 'effect';

import { Environment } from '~/core/environment';
import { AVATAR_PROPERTY } from '~/core/profile/history-ontology';
import { findMediaUrlValue } from '~/core/utils/media-url';

import { graphql } from './graphql';

interface NetworkResult {
  entities: {
    id: string;
    relationsList: { toEntity: { valuesList: { property: { id: string }; text: string | null }[] } | null }[];
  }[];
}

/**
 * Avatars for organisations the modal knows by id but has no relations for.
 *
 * The profile read picks these up on the way past an Employment edge. A position
 * being added has no edge yet, so the employer's logo has to be asked for
 * directly — otherwise a card looks different before and after saving, which is
 * the one thing the merged view exists to avoid.
 */
const avatarsQuery = (entityIds: string[]) => `
  {
    entities(filter: { id: { in: ${JSON.stringify(entityIds)} } }) {
      id
      relationsList(filter: { typeId: { is: ${JSON.stringify(AVATAR_PROPERTY)} } }) {
        toEntity { valuesList { property { id } text } }
      }
    }
  }
`;

export function entityAvatarsQueryKey(entityIds: string[]) {
  return ['entity-avatars', [...entityIds].sort().join(',')] as const;
}

export async function fetchEntityAvatars(entityIds: string[]): Promise<Record<string, string | null>> {
  if (entityIds.length === 0) return {};

  const result = await Effect.runPromise(
    Effect.either(
      graphql<NetworkResult>({
        query: avatarsQuery(entityIds),
        endpoint: Environment.getConfig().api,
      })
    )
  );

  if (Either.isLeft(result)) {
    console.error('[entity-avatars] failed to fetch avatars:', result.left);
    // The initial-letter fallback is a perfectly good thumbnail, so a failure
    // here costs a logo and nothing else.
    return {};
  }

  const avatars: Record<string, string | null> = {};

  for (const entity of result.right.entities) {
    for (const relation of entity.relationsList) {
      const values = relation.toEntity?.valuesList ?? [];
      const url = findMediaUrlValue(values.map(value => ({ value: value.text, property: value.property })));
      if (url) {
        avatars[entity.id] = url;
        break;
      }
    }
  }

  return avatars;
}
