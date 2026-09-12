import { Effect, Either } from 'effect';

import { Environment } from '~/core/environment';
import { AVATAR_PROPERTY, EDUCATION_PROPERTY, EMPLOYMENT_PROPERTY } from '~/core/profile/history-ontology';
import {
  type EducationCard,
  type EmploymentCard,
  type HistoryEdgeNode,
  normalizeEducation,
  normalizeEmployment,
} from '~/core/profile/normalize-history';

import { graphql } from './graphql';

interface NetworkResult {
  entity: {
    employment: HistoryEdgeNode[];
    education: HistoryEdgeNode[];
  } | null;
}

export interface ProfileHistory {
  employment: EmploymentCard[];
  education: EducationCard[];
}

/**
 * Three levels in one request. The middle level is the entity each relation
 * carries — `entity { … }` on a relation — and it is where the roles hang off a
 * company, and the dates off a role.
 *
 * Values and relations are read unfiltered at the stint and tenure levels rather
 * than filtered by property id: the same nested block has to serve the current
 * shape and the legacy one, which puts dates on the stint instead. Both levels
 * hold a handful of rows, so there is nothing to save by narrowing them.
 *
 * Row ids and their spaces come back alongside the content because removing a
 * row has to delete what hangs off it: a relation id cannot be reconstructed the
 * way a value id can, and a row in another space is not ours to delete.
 */
const nested = `
  valuesList { id spaceId property { id } date text decimal }
  relationsList {
    id
    entityId
    spaceId
    type { id }
    toEntity { id name }
    entity {
      valuesList { id spaceId property { id } date text decimal }
      relationsList {
        id
        entityId
        spaceId
        type { id }
        toEntity { id name }
        entity { valuesList { property { id } date text } }
      }
    }
  }
`;

/**
 * The organisation's own avatar, two hops down: the Avatar relation points at an
 * image entity, and the URL is a value on that.
 */
const orgAvatar = `
  relationsList(filter: { typeId: { is: ${JSON.stringify(AVATAR_PROPERTY)} } }) {
    toEntity { valuesList { property { id } text } }
  }
`;

const profileHistoryQuery = (entityId: string) => `
  {
    entity(id: ${JSON.stringify(entityId)}) {
      employment: relationsList(filter: { typeId: { is: ${JSON.stringify(EMPLOYMENT_PROPERTY)} } }) {
        id
        entityId
        toEntity { id name ${orgAvatar} }
        entity { ${nested} }
      }
      education: relationsList(filter: { typeId: { is: ${JSON.stringify(EDUCATION_PROPERTY)} } }) {
        id
        entityId
        toEntity { id name ${orgAvatar} }
        entity { ${nested} }
      }
    }
  }
`;

export function profileHistoryQueryKey(entityId: string | undefined) {
  return ['profile-history', entityId] as const;
}

export async function fetchProfileHistory(entityId: string): Promise<ProfileHistory> {
  const result = await Effect.runPromise(
    Effect.either(
      graphql<NetworkResult>({
        query: profileHistoryQuery(entityId),
        endpoint: Environment.getConfig().api,
      })
    )
  );

  if (Either.isLeft(result)) {
    console.error(`[profile-history] failed to fetch history for ${entityId}:`, result.left);
    // Empty rather than thrown: the sections render as "nothing here yet", which
    // is wrong but harmless, where a throw would take the whole modal down with
    // it and block the four fields that have nothing to do with this.
    return { employment: [], education: [] };
  }

  const entity = result.right.entity;

  return {
    employment: normalizeEmployment(entity?.employment ?? []),
    education: normalizeEducation(entity?.education ?? []),
  };
}
