import { uuidToHex } from '~/core/id/normalize';

type InterestRowLike = { fromEntityId: string; spaceId: string; [key: string]: unknown };

/**
 * The allocation target for an interest row: the curator's personal space id.
 * New rows are authored from the personal-space system entity in the curator's
 * own personal space, so both sides agree; legacy person-entity rows were also
 * written into the curator's personal space, so the row's spaceId is the
 * target. Rows authored into the bounty's own DAO space (an earlier geogenesis
 * shape) already point from the personal-space entity.
 */
export function interestAllocationTarget(row: InterestRowLike, bountySpaceId: string): string {
  return uuidToHex(row.spaceId) === uuidToHex(bountySpaceId) ? uuidToHex(row.fromEntityId) : uuidToHex(row.spaceId);
}

/** Distinct interested curators, deduped across relation shapes by their personal space id. */
export function distinctInterestedIds(interest: readonly InterestRowLike[], bountySpaceId: string): string[] {
  return [...new Set(interest.map(row => interestAllocationTarget(row, bountySpaceId)))];
}
