import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

import { fetchPendingVoteProposalIds } from '~/core/browse/fetch-browse-sidebar-data';
import { resolveMemberSpaceFromWalletSafe } from '~/core/browse/resolve-member-space-from-wallet';
import { WALLET_ADDRESS } from '~/core/cookie';
import { fetchEditorSpaceIds } from '~/core/io/subgraph/fetch-editor-space-ids';
import {
  getCachedWalletSpace,
  getPendingVotes,
  seedPendingVotes,
  setCachedWalletSpace,
} from '~/core/notifications/pending-votes-store';

/**
 * Lightweight endpoint the browse sidebar polls for the red-dot state.
 *
 * Fast path: Redis SMEMBERS on pending_votes:{user_space_id}. Single-digit ms.
 *
 * Fallback: if the cache has no entry (cold start or TTL'd out), run the
 * authoritative REST scan once and seed the cache. Subsequent polls hit
 * the fast path until webhooks or TTL expire the key again.
 *
 * Never accepts a userSpaceId from the caller — the caller can only see
 * their own state, resolved from the WALLET_ADDRESS cookie.
 */
export async function GET() {
  const walletAddress = (await cookies()).get(WALLET_ADDRESS)?.value;
  if (!walletAddress) {
    return NextResponse.json({ proposalIds: [] });
  }

  const userSpaceId = await resolveUserSpaceId(walletAddress);
  if (!userSpaceId) {
    return NextResponse.json({ proposalIds: [] });
  }

  const cached = await getPendingVotes(userSpaceId);
  if (cached.hit) {
    return NextResponse.json({ proposalIds: cached.proposalIds });
  }

  // Cold cache: rebuild from authoritative source, then seed Redis so subsequent polls hit fast path.
  const editorSpaceIds = await fetchEditorSpaceIds(userSpaceId);
  if (editorSpaceIds.length === 0) {
    await seedPendingVotes(userSpaceId, []);
    return NextResponse.json({ proposalIds: [] });
  }

  const proposalIds = await fetchPendingVoteProposalIds(userSpaceId, editorSpaceIds);
  await seedPendingVotes(userSpaceId, proposalIds);
  return NextResponse.json({ proposalIds });
}

async function resolveUserSpaceId(walletAddress: string): Promise<string | null> {
  const cached = await getCachedWalletSpace(walletAddress);
  if (cached !== null) {
    return cached === '' ? null : cached;
  }
  const resolved = await resolveMemberSpaceFromWalletSafe(walletAddress);
  await setCachedWalletSpace(walletAddress, resolved);
  return resolved;
}
