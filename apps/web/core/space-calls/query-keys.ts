import { dashlessId } from '~/core/debates/api';

/**
 * A space's past calls, an infinite query. Kept outside the live list's `['debates','space-calls',id]`
 * prefix, which the gateway patches as a list; the gateway refetches this when a call ends.
 */
export const spacePastCallsQueryKey = (spaceId: string) =>
  ['debates', 'space-past-calls', dashlessId(spaceId)] as const;
