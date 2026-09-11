import { Effect, Either } from 'effect';

import { Environment } from '~/core/environment';
import {
  IS_REQUIRED_PROPERTY,
  SCOPE_RANK_PROPERTY,
  SKILLS_PROPERTY,
  SKILL_SCOPE_PROPERTY,
} from '~/core/profile/history-ontology';
import { type RoleSkill, normalizeRoleSkills } from '~/core/profile/rank-role-skills';

import { graphql } from './graphql';

interface NetworkResult {
  entity: {
    skills: {
      entity: { valuesList: { propertyId: string; boolean: boolean | null }[] } | null;
      toEntity: {
        id: string;
        name: string | null;
        relationsList: { toEntity: { valuesList: { propertyId: string; integer: string | null }[] } | null }[];
      } | null;
    }[];
  } | null;
}

/**
 * An occupation's skills, with everything needed to rank them, in one request.
 *
 * The obvious shape is two: the role's skills, then the scopes of the skills that
 * came back. That is what the import memo suggests, and it is one round trip more
 * than necessary — the scope hangs off the skill, so it can be selected on the
 * way through. A role tops out around ninety skills, so the whole thing is a
 * single bounded read.
 *
 * `Is required?` is read from `entity` — the relation's own entity — and not from
 * either end of it. Neither the role nor the skill knows whether the skill is
 * essential; only the edge between them does.
 */
const roleSkillsQuery = (roleId: string) => `
  {
    entity(id: ${JSON.stringify(roleId)}) {
      skills: relationsList(filter: { typeId: { is: ${JSON.stringify(SKILLS_PROPERTY)} } }) {
        entity { valuesList { propertyId boolean } }
        toEntity {
          id
          name
          relationsList(filter: { typeId: { is: ${JSON.stringify(SKILL_SCOPE_PROPERTY)} } }) {
            toEntity { valuesList { propertyId integer } }
          }
        }
      }
    }
  }
`;

export function roleSkillsQueryKey(roleId: string | undefined) {
  return ['role-skills', roleId] as const;
}

export async function fetchRoleSkills(roleId: string): Promise<RoleSkill[]> {
  const result = await Effect.runPromise(
    Effect.either(
      graphql<NetworkResult>({
        query: roleSkillsQuery(roleId),
        endpoint: Environment.getConfig().api,
      })
    )
  );

  if (Either.isLeft(result)) {
    console.error(`[role-skills] failed to fetch skills for ${roleId}:`, result.left);
    // Empty rather than thrown. Suggestions are a convenience on top of a picker
    // that works without them, so a failure here costs the shortcut and nothing
    // else — the sheet still saves whatever the user types.
    return [];
  }

  return normalizeRoleSkills(
    (result.right.entity?.skills ?? []).map(relation => ({
      isRequired: relation.entity?.valuesList.find(value => value.propertyId === IS_REQUIRED_PROPERTY)?.boolean ?? null,
      skill: relation.toEntity,
      rank:
        relation.toEntity?.relationsList[0]?.toEntity?.valuesList.find(
          value => value.propertyId === SCOPE_RANK_PROPERTY
        )?.integer ?? null,
    }))
  );
}
