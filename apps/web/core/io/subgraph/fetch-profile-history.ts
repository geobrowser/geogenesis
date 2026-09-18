import { Effect, Either } from 'effect';

import { Environment } from '~/core/environment';
import {
  AVATAR_PROPERTY,
  COVER_PROPERTY,
  EDUCATION_PROPERTY,
  EMPLOYMENT_PROPERTY,
} from '~/core/profile/history-ontology';
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
 *
 * **Scoped at every level, not just the outer edge.** A stint is its own entity,
 * so another space can write a role or a tenure onto the same one — the outer
 * filter would not stop that reaching the page, which leaves the boundary this
 * file states only half true. Nothing in the graph does it today (0 of 1,906
 * employment edges and 0 of 538 education ones carry a row from another space),
 * so this closes the hole rather than fixing a visible bug.
 *
 * What is deliberately *not* scoped: `toEntity`, and the values hanging off it.
 * A role's name, a skill's name and an organisation's avatar belong to that
 * entity and are authored in its own space — filtering those to the profile's
 * space would blank the name of every company somebody has ever worked for.
 * The rule is that assertions *about this person* are scoped; the things those
 * assertions point at are not.
 */
const nested = (spaceId: string) => {
  const ours = `filter: { spaceId: { is: ${JSON.stringify(spaceId)} } }`;

  return `
  valuesList(${ours}) { id spaceId property { id } date text decimal }
  relationsList(${ours}) {
    id
    entityId
    spaceId
    type { id }
    toEntity { id name }
    entity {
      valuesList(${ours}) { id spaceId property { id } date text decimal }
      relationsList(${ours}) {
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
};

/**
 * The organisation's own picture, two hops down: the relation points at an image
 * entity and the URL is a value on that.
 *
 * Avatar *or* cover. Plenty of companies in the graph have set only a banner,
 * and a cover cropped into a 36px square is a far better answer than the grey
 * placeholder — it is at least this organisation's own image. Avatar is asked
 * for first so it wins where both exist; see `readAvatar`.
 */
const orgAvatar = `
  avatar: relationsList(filter: { typeId: { is: ${JSON.stringify(AVATAR_PROPERTY)} } }) {
    toEntity { valuesList { property { id } text } }
  }
  cover: relationsList(filter: { typeId: { is: ${JSON.stringify(COVER_PROPERTY)} } }) {
    toEntity { valuesList { property { id } text } }
  }
`;

/**
 * Scoped to the space being read.
 *
 * A person entity is written to by more than their own space — an Employment
 * relation authored by Crypto hangs off the same entity — and unfiltered this
 * put another space's record of somebody on their profile. The page renders
 * what *this* space claims about them; what other spaces assert is a different
 * page, and worth designing rather than leaking into this one.
 */
const profileHistoryQuery = (entityId: string, spaceId: string) => `
  {
    entity(id: ${JSON.stringify(entityId)}) {
      employment: relationsList(filter: {
        typeId: { is: ${JSON.stringify(EMPLOYMENT_PROPERTY)} }
        spaceId: { is: ${JSON.stringify(spaceId)} }
      }) {
        id
        entityId
        spaceId
        toEntity { id name ${orgAvatar} }
        entity { ${nested(spaceId)} }
      }
      education: relationsList(filter: {
        typeId: { is: ${JSON.stringify(EDUCATION_PROPERTY)} }
        spaceId: { is: ${JSON.stringify(spaceId)} }
      }) {
        id
        entityId
        spaceId
        toEntity { id name ${orgAvatar} }
        entity { ${nested(spaceId)} }
      }
    }
  }
`;

/** Keyed on the space too: the same person reads differently from each one. */
export function profileHistoryQueryKey(entityId: string | undefined, spaceId: string | undefined) {
  return ['profile-history', entityId, spaceId] as const;
}

export async function fetchProfileHistory(entityId: string, spaceId: string): Promise<ProfileHistory> {
  const result = await Effect.runPromise(
    Effect.either(
      graphql<NetworkResult>({
        query: profileHistoryQuery(entityId, spaceId),
        endpoint: Environment.getConfig().api,
      })
    )
  );

  if (Either.isLeft(result)) {
    console.error(`[profile-history] failed to fetch history for ${entityId}:`, result.left);
    // Thrown rather than answered with nothing. An empty answer reads as "no
    // records", and the sections stayed editable on the strength of it — so a
    // company already on the profile could be added again, opening a second
    // Employment edge to the employer whose existing one the failure had hidden.
    //
    // React Query holds the error; the modal shows the sections as unavailable
    // and leaves the four header fields alone, which is what a throw used to be
    // avoided for.
    throw new Error(`Failed to fetch profile history for ${entityId}`, { cause: result.left });
  }

  const entity = result.right.entity;

  return {
    employment: normalizeEmployment(entity?.employment ?? []),
    education: normalizeEducation(entity?.education ?? []),
  };
}
