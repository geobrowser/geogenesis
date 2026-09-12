/**
 * Ranking an occupation's skills into something worth suggesting.
 *
 * Kept apart from the fetch so the ordering can be argued with in a test rather
 * than against the live graph.
 */

export type RoleSkill = {
  id: string;
  name: string | null;
  /** Essential to the occupation, as recorded on the role→skill relation. */
  isRequired: boolean;
  /**
   * How widely the skill transfers: 1 transversal through 4 occupation-specific.
   * Higher is more distinctive, so higher is a better suggestion.
   */
  rank: number;
};

type RawRoleSkill = {
  isRequired: boolean | null;
  skill: { id: string; name: string | null } | null;
  rank: string | null;
};

/** Where a skill with no scope sorts: below everything that has one. */
const UNSCOPED = 0;

export function normalizeRoleSkills(rows: RawRoleSkill[]): RoleSkill[] {
  const skills: RoleSkill[] = [];

  for (const row of rows) {
    if (!row.skill) continue;

    // The graph stores rank as an integer and GraphQL hands it back as a BigInt,
    // which arrives as a string. Sorting those directly is lexicographic, which
    // happens to be right for 1–4 and would go wrong the moment the scale grows.
    const rank = row.rank === null ? Number.NaN : Number.parseInt(row.rank, 10);

    skills.push({
      id: row.skill.id,
      name: row.skill.name,
      isRequired: row.isRequired === true,
      rank: Number.isNaN(rank) ? UNSCOPED : rank,
    });
  }

  return skills;
}

/**
 * The five worth offering, given what the user has already picked.
 *
 * Essential skills first, then the most distinctive within each group. Both
 * halves of that matter: taking the essential ones alone leaves roles with only
 * a handful of them showing two suggestions, and ranking alone puts an optional
 * occupation-specific skill above an essential one.
 *
 * Rank is what keeps the list from being useless. `Computer programming` is
 * essential to Software developer and transversal, so it says almost nothing
 * about the job and sorts last of the essential ones rather than into the five.
 *
 * Ties are left in the order the graph returned them. The relation's `position`
 * looks like it should break them and does not — it encodes only that essential
 * sorts before optional, and within each group it is whatever ESCO happened to
 * hand over.
 */
export function suggestSkills(skills: RoleSkill[], alreadyPicked: string[], limit = 5): RoleSkill[] {
  const picked = new Set(alreadyPicked);

  return skills
    .filter(skill => !picked.has(skill.id))
    .sort((a, b) => {
      if (a.isRequired !== b.isRequired) return a.isRequired ? -1 : 1;
      return b.rank - a.rank;
    })
    .slice(0, limit);
}
