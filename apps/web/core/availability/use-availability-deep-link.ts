'use client';

import { useDeepLinkEffect, useDeepLinkParams } from '~/core/deep-links/use-deep-link';

import { AVAILABILITY_MODAL } from './availability-deep-link';

/**
 * Hands the person a `?modal=availability` link names to `open`, once. No auth gate: the week
 * itself asks a signed-out recipient to sign in, which keeps the link working for exactly the
 * people it is sent to.
 */
export function useAvailabilityDeepLink(open: (profileSpaceId: string) => void) {
  const link = useDeepLinkParams(AVAILABILITY_MODAL);
  const profileSpaceId = link.target;

  useDeepLinkEffect({
    ...link,
    // Without a person there is nobody's week to open, and the trigger stays rather than being
    // cleared for nothing.
    enabled: profileSpaceId !== null,
    run: () => {
      if (profileSpaceId) open(profileSpaceId);
    },
  });
}
