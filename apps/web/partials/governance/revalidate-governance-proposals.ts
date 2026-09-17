'use server';

import { updateTag } from 'next/cache';

import { governanceProposalsTag } from '~/core/governance/proposals-cache';

/**
 * Drops a space's cached proposal list so the next render refetches.
 */
export async function revalidateGovernanceProposals(spaceId: string) {
  updateTag(governanceProposalsTag(spaceId));
}
