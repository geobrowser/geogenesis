import * as Effect from 'effect/Effect';

import { getSpaceByAddress, getSpacesWhereMember } from '~/core/io/queries';

import { editBurstLimit, editHourlyLimit } from '../../rate-limit';

// Membership is resolved once per request and memoized; read-only turns
// never pay the GraphQL cost.
export type RateLimitResult = { ok: true } | { ok: false; retryAfter: number };

export type WriteContext =
  | {
      kind: 'guest';
      walletAddress: null;
      personalSpaceId: string | null;
      isMember: (spaceId: string) => Promise<boolean>;
      checkEditRateLimit: () => Promise<RateLimitResult>;
      /** Always empty for guests; present for type symmetry with the member arm. */
      mintedBlockIds: Set<string>;
    }
  | {
      kind: 'member';
      walletAddress: string;
      personalSpaceId: () => Promise<string | null>;
      isMember: (spaceId: string) => Promise<boolean>;
      checkEditRateLimit: () => Promise<RateLimitResult>;
      // Tracks createBlock-minted ids so same-turn follow-ups skip the
      // live-graph BLOCKS-edge check.
      mintedBlockIds: Set<string>;
    };

const normalize = (id: string) => id.replace(/-/g, '').toLowerCase();

type Membership = {
  personalSpaceId: string | null;
  memberSpaceIds: Set<string>;
};

export function buildWriteContext({ walletAddress }: { walletAddress: string | null }): WriteContext {
  if (!walletAddress) {
    return {
      kind: 'guest',
      walletAddress: null,
      personalSpaceId: null,
      isMember: async () => false,
      checkEditRateLimit: async () => ({ ok: true }),
      mintedBlockIds: new Set<string>(),
    };
  }

  let membershipPromise: Promise<Membership> | null = null;

  const resolveMembership = (): Promise<Membership> => {
    if (membershipPromise) return membershipPromise;
    const attempt: Promise<Membership> = (async () => {
      try {
        const personalSpace = await Effect.runPromise(getSpaceByAddress(walletAddress));
        const personalSpaceId = personalSpace ? normalize(personalSpace.id) : null;

        if (!personalSpaceId) {
          return { personalSpaceId: null, memberSpaceIds: new Set<string>() };
        }

        const memberSpaces = await Effect.runPromise(getSpacesWhereMember(personalSpaceId));
        const memberSpaceIds = new Set<string>([personalSpaceId, ...memberSpaces.map(s => normalize(s.id))]);

        return { personalSpaceId, memberSpaceIds };
      } catch (err) {
        console.error('[chat/writeContext] membership lookup failed', err);
        // Clear unconditionally so the next call retries; an identity check
        // here was racy with concurrent first-callers.
        membershipPromise = null;
        return { personalSpaceId: null, memberSpaceIds: new Set<string>() };
      }
    })();
    membershipPromise = attempt;
    return attempt;
  };

  return {
    kind: 'member',
    walletAddress,
    personalSpaceId: async () => (await resolveMembership()).personalSpaceId,
    isMember: async spaceId => {
      const { memberSpaceIds } = await resolveMembership();
      return memberSpaceIds.has(normalize(spaceId));
    },
    checkEditRateLimit: async () => {
      try {
        const [burst, hourly] = await Promise.all([
          editBurstLimit.limit(walletAddress),
          editHourlyLimit.limit(walletAddress),
        ]);
        if (!burst.success || !hourly.success) {
          const reset = Math.max(burst.reset, hourly.reset);
          const retryAfter = Math.max(1, Math.ceil((reset - Date.now()) / 1000));
          return { ok: false, retryAfter };
        }
        return { ok: true };
      } catch (err) {
        // Upstash unreachable: dev passes through (don't block local work),
        // prod fails closed so partial Redis degradation can't bypass the
        // per-wallet edit cap.
        console.error('[chat/editRateLimit] unavailable', err);
        if (process.env.NODE_ENV === 'production') {
          return { ok: false, retryAfter: 5 };
        }
        return { ok: true };
      }
    },
    mintedBlockIds: new Set<string>(),
  };
}
