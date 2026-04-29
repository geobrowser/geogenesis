import * as Effect from 'effect/Effect';

import { getSpaceByAddress, getSpacesWhereMember } from '~/core/io/queries';

import { editBurstLimit, editHourlyLimit } from '../../rate-limit';

/**
 * Write tools can only be invoked by signed-in users, and each write targets a
 * specific space the user must be a member of. This helper resolves that
 * membership once per request and exposes an async `isMember(spaceId)` check.
 *
 * The membership promise is memoized: the first tool to call `isMember` pays
 * for the two GraphQL round trips; subsequent calls await the same promise.
 * Read-only turns never pay anything because tools never call isMember.
 */
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
      /**
       * Block ids that `createBlock` minted in this request. Validation helpers
       * (resolveBlocksEdge) consult this set so follow-up intents in the same
       * turn — e.g. `setDataBlockView` right after `createBlock` — don't fail
       * the live-graph BLOCKS-edge check for a block that's only staged.
       */
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
        // Clear unconditionally so the next tool call retries — the previous
        // identity check (`membershipPromise === attempt`) was racy when two
        // concurrent first-callers each installed their own attempt.
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
        // Upstash unreachable. In dev (no redis env vars) we let edits through
        // so local work isn't blocked. In production we fail closed — partial
        // Redis degradation could make this catch fire even when the route's
        // top-level limiter succeeded against a healthy replica, and silently
        // bypassing the per-wallet edit cap there would defeat the purpose.
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
