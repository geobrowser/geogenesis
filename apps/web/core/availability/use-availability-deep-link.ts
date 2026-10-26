'use client';

import { useDeepLinkEffect, useDeepLinkParams } from '~/core/deep-links/use-deep-link';
import { usePathSegments } from '~/core/hooks/use-path-segments';

import {
  AVAILABILITY_MODAL,
  profileSpaceIdFromPath,
  requestIdFromTarget,
  startFromTarget,
} from './availability-deep-link';

/**
 * Hands `onArrive` the space a `?modal=availability` link landed on, once — or `null` when it
 * landed anywhere but a space's own root, which only a hand-edited link does. Cleared either way, so
 * a bad link does not keep firing on refresh.
 *
 * The second argument is the scheduled request the link asks to move, when it names one (see
 * `requestIdFromTarget`). The third is the link's `via` attribution, if it carried any. The fourth is
 * a time the link picks in advance (`startFromTarget`, GEO-3429).
 *
 * No auth gate: the week itself asks a signed-out recipient to sign in, which keeps the link
 * working for exactly the people it is sent to.
 */
export function useAvailabilityDeepLink(
  onArrive: (
    profileSpaceId: string | null,
    rescheduleRequestId: string | null,
    via: string | null,
    pickedStart: string | null
  ) => void
) {
  const link = useDeepLinkParams(AVAILABILITY_MODAL);
  const profileSpaceId = profileSpaceIdFromPath(usePathSegments());
  const rescheduleRequestId = requestIdFromTarget(link.target);
  const pickedStart = startFromTarget(link.target);

  useDeepLinkEffect({ ...link, run: () => onArrive(profileSpaceId, rescheduleRequestId, link.via, pickedStart) });
}
