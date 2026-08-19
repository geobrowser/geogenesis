import type { SpaceBounty } from '~/core/community/bounty-types';

import type { BoardBounty } from './types';

/**
 * Adapts the bounty domain model to the community tab's card view-model.
 * The community-tab cards (`partials/community-tab/bounty-card.tsx`) keep
 * their own design and prop shape; the data now comes from `core/bounties`
 * (one board query per space) instead of a per-status API route.
 */
export function toSpaceBounty(bounty: BoardBounty): SpaceBounty {
  return {
    id: bounty.id,
    spaceId: bounty.spaceId,
    name: bounty.name,
    description: bounty.description,
    budget: bounty.budget,
    difficulty: bounty.difficulty,
    skills: bounty.skills.map(skill => skill.name),
    isFeatured: bounty.isFeatured,
    contributors: bounty.contributors,
  };
}

/** Distinct skill names across bounties, sorted — the community tab's skill checkbox options. */
export function collectSkillNames(bounties: readonly BoardBounty[]): string[] {
  return [...new Set(bounties.flatMap(bounty => bounty.skills.map(skill => skill.name)))].sort((a, b) =>
    a.localeCompare(b)
  );
}

/** Name → id for the skills on these bounties (the community tab filters by name; the board filters by id). */
export function skillIdsByName(bounties: readonly BoardBounty[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const bounty of bounties) for (const skill of bounty.skills) map.set(skill.name, skill.id);
  return map;
}
