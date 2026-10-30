import { GeoChatRequestError } from './api';

/**
 * Whether the last history read (GEO-3464) found no route: geo-chat answers 404 until #299 deploys.
 * Refetching then only adds another 404 per event, so the refreshes that would ask again skip it,
 * and a mount still asks, which is what finds the route once it lands.
 */
export function historyRouteMissing(state: { error: unknown } | undefined) {
  return state?.error instanceof GeoChatRequestError && state.error.status === 404;
}
