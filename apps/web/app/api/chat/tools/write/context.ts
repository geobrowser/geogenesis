import * as Effect from 'effect/Effect';

import { getSpaceAccessById } from '~/core/access/space-access';
import { getSpaceByAddress } from '~/core/io/queries';

import { editLimit } from '../../rate-limit';

// Membership resolves once per request; read-only turns skip the lookup.
export type RateLimitResult = { ok: true } | { ok: false; retryAfter: number };

export type WriteContext =
  | {
      kind: 'guest';
      walletAddress: null;
      personalSpaceId: string | null;
      /** True for any space the user can edit (legacy name kept for write tools). */
      isMember: (spaceId: string) => Promise<boolean>;
      checkEditRateLimit: () => Promise<RateLimitResult>;
    }
  | {
      kind: 'member';
      walletAddress: string;
      personalSpaceId: () => Promise<string | null>;
      /** True for any space the user can edit (legacy name kept for write tools). */
      isMember: (spaceId: string) => Promise<boolean>;
      checkEditRateLimit: () => Promise<RateLimitResult>;
    };

const normalize = (id: string) => id.replace(/-/g, '').toLowerCase();

type Membership = {
  personalSpaceId: string | null;
};

export function buildWriteContext({ walletAddress }: { walletAddress: string | null }): WriteContext {
  if (!walletAddress) {
    return {
      kind: 'guest',
      walletAddress: null,
      personalSpaceId: null,
      isMember: async () => false,
      checkEditRateLimit: async () => ({ ok: true }),
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
          return { personalSpaceId: null };
        }

        return { personalSpaceId };
      } catch (err) {
        console.error('[chat/writeContext] membership lookup failed', err);
        // Clear unconditionally so the next call retries — an identity check
        // here would race concurrent first-callers.
        membershipPromise = null;
        return { personalSpaceId: null };
      }
    })();
    membershipPromise = attempt;
    return attempt;
  };

  const accessBySpaceId = new Map<string, Promise<boolean>>();

  const canEditSpace = (spaceId: string): Promise<boolean> => {
    const normalizedSpaceId = normalize(spaceId);
    const cached = accessBySpaceId.get(normalizedSpaceId);

    if (cached) return cached;

    const accessPromise = (async () => {
      const { personalSpaceId } = await resolveMembership();

      if (!personalSpaceId) {
        return false;
      }

      const access = await Effect.runPromise(getSpaceAccessById(normalizedSpaceId, personalSpaceId));
      return access.canEdit;
    })().catch(err => {
      accessBySpaceId.delete(normalizedSpaceId);
      throw err;
    });

    accessBySpaceId.set(normalizedSpaceId, accessPromise);
    return accessPromise;
  };

  return {
    kind: 'member',
    walletAddress,
    personalSpaceId: async () => (await resolveMembership()).personalSpaceId,
    isMember: canEditSpace,
    checkEditRateLimit: async () => {
      try {
        const result = await editLimit.limit(walletAddress);
        if (!result.success) {
          const retryAfter = Math.max(1, Math.ceil((result.reset - Date.now()) / 1000));
          return { ok: false, retryAfter };
        }
        return { ok: true };
      } catch (err) {
        // Upstash unreachable: dev passes through; prod fails closed.
        console.error('[chat/editRateLimit] unavailable', err);
        if (process.env.NODE_ENV === 'production') {
          return { ok: false, retryAfter: 5 };
        }
        return { ok: true };
      }
    },
  };
}
