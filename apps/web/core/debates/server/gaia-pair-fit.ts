import { gaiaInternalBaseUrl } from '~/core/explore/for-you/gaia-for-you';

import { type PairFitItem, parsePairFitItems } from '../matchmaking/pair-fit';

/**
 * The server-side client for gaia's private `POST /internal/pair-fit` (GEO-3224).
 *
 * SERVER ONLY: it carries GAIA_INTERNAL_TOKEN, as For you does. Called only after the caller has
 * been proven a debates admin. Unset token means the feature is off; any failure or a slow answer
 * returns null, and New match keeps its existing order.
 *
 * Logs no ids: the scores are about people's positions.
 */

export const GAIA_PAIR_FIT_TIMEOUT_MS = 2_500;

export async function fetchGaiaPairFit(
  args: { userId: string; candidateIds: readonly string[] },
  options: { fetcher?: typeof fetch; timeoutMs?: number } = {}
): Promise<PairFitItem[] | null> {
  const token = process.env.GAIA_INTERNAL_TOKEN?.trim();
  if (!token) return null;
  const fetcher = options.fetcher ?? fetch;
  try {
    const response = await fetcher(`${gaiaInternalBaseUrl()}/internal/pair-fit`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-internal-token': token },
      body: JSON.stringify({ userId: args.userId, candidateIds: args.candidateIds }),
      cache: 'no-store',
      signal: AbortSignal.timeout(options.timeoutMs ?? GAIA_PAIR_FIT_TIMEOUT_MS),
    });
    if (!response.ok) {
      console.error('pair fit: gaia answered', response.status);
      return null;
    }
    return parsePairFitItems(await response.json());
  } catch (error) {
    console.error('pair fit: gaia unavailable, keeping the existing order', error instanceof Error ? error.name : '');
    return null;
  }
}
