import { getConfig } from '~/core/environment/environment';

import type { ForYouReason, ForYouScore } from './feed-version';

/**
 * The server-side client for gaia's private `POST /internal/for-you` (GEO-3140).
 *
 * SERVER ONLY. It carries GAIA_INTERNAL_TOKEN, a shared secret the browser must never see, and it
 * is called only with a personal space id this server derived from a verified Privy identity token.
 * Unset token means the feature is off: every call returns null and Explore serves Best.
 *
 * Bounded by a short timeout, and any failure returns null, so a slow or broken gaia costs a For
 * you reader the personalization, never the feed.
 */

export const GAIA_FOR_YOU_TIMEOUT_MS = 1_200;

export type GaiaForYouItem = {
  entityId: string;
  bestPosition: number;
  score: ForYouScore;
  reason: ForYouReason | null;
  exploration: boolean;
  explorationProbability: number | null;
};

export type GaiaFeedExperiment = {
  id: string;
  arms: [string, string];
  interleaved: boolean;
  assignment: 'member' | 'hash';
};

export type GaiaForYouResponse = {
  ranking: { name: 'for-you'; version: string; codeVersion: number; configRevision: number };
  personalized: boolean;
  asOf: string;
  items: GaiaForYouItem[];
  excluded: { entityId: string; reason: 'voted' | 'interested' }[];
  exploration: { share: number; slots: number; poolSize: number; picked: number } | null;
  experiment: GaiaFeedExperiment | null;
};

/** Whether For you can be personalized at all in this deployment. */
export function gaiaForYouConfigured(): boolean {
  return Boolean(process.env.GAIA_INTERNAL_TOKEN?.trim());
}

export function gaiaInternalBaseUrl(): string {
  const override = process.env.GAIA_INTERNAL_URL?.trim();
  if (override) return override.replace(/\/$/, '');
  // The api that serves the app's GraphQL also serves /internal.
  return new URL(getConfig().api).origin;
}

function isResponse(value: unknown): value is GaiaForYouResponse {
  const v = value as GaiaForYouResponse | null;
  return Boolean(
    v &&
    typeof v === 'object' &&
    v.ranking &&
    typeof v.ranking.version === 'string' &&
    typeof v.personalized === 'boolean' &&
    Array.isArray(v.items) &&
    Array.isArray(v.excluded)
  );
}

export async function fetchGaiaForYou(
  args: { userId: string; candidateIds: readonly string[]; asOf?: string | null },
  options: { fetcher?: typeof fetch; timeoutMs?: number } = {}
): Promise<GaiaForYouResponse | null> {
  const token = process.env.GAIA_INTERNAL_TOKEN?.trim();
  if (!token) return null;
  const fetcher = options.fetcher ?? fetch;
  try {
    const response = await fetcher(`${gaiaInternalBaseUrl()}/internal/for-you`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-internal-token': token },
      body: JSON.stringify({ userId: args.userId, candidateIds: args.candidateIds, asOf: args.asOf ?? undefined }),
      cache: 'no-store',
      signal: AbortSignal.timeout(options.timeoutMs ?? GAIA_FOR_YOU_TIMEOUT_MS),
    });
    if (!response.ok) {
      console.error('for you: gaia answered', response.status);
      return null;
    }
    const body: unknown = await response.json();
    return isResponse(body) ? body : null;
  } catch (error) {
    console.error('for you: gaia unavailable, serving Best', error);
    return null;
  }
}
