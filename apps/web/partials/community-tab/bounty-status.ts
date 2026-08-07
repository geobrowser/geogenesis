/**
 * Bounty status slugs used in the `/community/bounties/[status]` route.
 */
export type BountyStatusSlug = 'completed' | 'in-progress' | 'available';

export const BOUNTY_STATUS_SLUGS: readonly BountyStatusSlug[] = ['completed', 'in-progress', 'available'];

export function isBountyStatusSlug(value: string): value is BountyStatusSlug {
  return (BOUNTY_STATUS_SLUGS as readonly string[]).includes(value);
}
