import { Redis } from '@upstash/redis';

const redis = Redis.fromEnv();

const PENDING_VOTES_TTL_SECONDS = 24 * 60 * 60; // 24h — self-heal if a webhook is missed
const NOTIF_SEEN_TTL_SECONDS = 7 * 24 * 60 * 60; // 7d — idempotency deduplication window
const WALLET_SPACE_TTL_SECONDS = 24 * 60 * 60; // 24h — maps wallet → user_space_id to avoid a subgraph hit per poll

const pendingVotesKey = (userSpaceId: string) => `pending_votes:${userSpaceId}`;
const notifSeenKey = (idempotencyKey: string) => `notif_seen:${idempotencyKey}`;
const walletSpaceKey = (walletAddress: string) => `wallet_space:${walletAddress.toLowerCase()}`;

/** Records a webhook as already processed. Returns false if it was already seen. */
export async function markNotificationSeen(idempotencyKey: string): Promise<boolean> {
  const res = await redis.set(notifSeenKey(idempotencyKey), '1', {
    nx: true,
    ex: NOTIF_SEEN_TTL_SECONDS,
  });
  return res === 'OK';
}

/** Adds a proposal id to the user's pending-vote set and refreshes TTL. Ignores no-op on duplicate. */
export async function addPendingVote(userSpaceId: string, proposalId: string): Promise<void> {
  const key = pendingVotesKey(userSpaceId);
  const pipeline = redis.pipeline();
  pipeline.sadd(key, proposalId);
  pipeline.expire(key, PENDING_VOTES_TTL_SECONDS);
  await pipeline.exec();
}

/** Removes a proposal id from the user's pending-vote set. */
export async function removePendingVote(userSpaceId: string, proposalId: string): Promise<void> {
  await redis.srem(pendingVotesKey(userSpaceId), proposalId);
}

type PendingVotesCache =
  | { hit: true; proposalIds: string[] }
  | { hit: false };

/** Returns the cached pending-vote ids for a user, or `hit: false` if no cache exists. */
export async function getPendingVotes(userSpaceId: string): Promise<PendingVotesCache> {
  const key = pendingVotesKey(userSpaceId);
  const exists = await redis.exists(key);
  if (exists === 0) return { hit: false };
  const ids = await redis.smembers(key);
  return { hit: true, proposalIds: ids as string[] };
}

/**
 * Replaces the cached set for a user with the given ids. Used by the read endpoint's
 * fallback path when no cache entry exists — repopulates from the authoritative scan.
 */
export async function seedPendingVotes(userSpaceId: string, proposalIds: string[]): Promise<void> {
  const key = pendingVotesKey(userSpaceId);
  const pipeline = redis.pipeline();
  pipeline.del(key);
  if (proposalIds.length > 0) {
    const [first, ...rest] = proposalIds;
    pipeline.sadd(key, first, ...rest);
  }
  pipeline.expire(key, PENDING_VOTES_TTL_SECONDS);
  await pipeline.exec();
}

/** Cached wallet → user_space_id lookup so polls don't hit the subgraph every time. */
export async function getCachedWalletSpace(walletAddress: string): Promise<string | null> {
  const value = await redis.get<string>(walletSpaceKey(walletAddress));
  return value ?? null;
}

/** Persists the wallet → user_space_id mapping. Stores the empty string when the wallet has no space. */
export async function setCachedWalletSpace(
  walletAddress: string,
  userSpaceId: string | null
): Promise<void> {
  await redis.set(walletSpaceKey(walletAddress), userSpaceId ?? '', {
    ex: WALLET_SPACE_TTL_SECONDS,
  });
}
