'use client';

import * as React from 'react';

import { copyAvailabilityLink } from '~/core/availability/availability-deep-link';
import { useSetToast } from '~/core/hooks/use-toast';
import { usePeerAvailabilityEnabled } from '~/core/state/feature-flags';

import { MenuItem } from '~/design-system/menu';

/**
 * "Copy availability link" in a profile's overflow menu, for the owner and visitors alike — anyone
 * looking at someone may want to pass on a way to book them.
 */
export function CopyAvailabilityLinkMenuItem({ profileSpaceId }: { profileSpaceId: string }) {
  const enabled = usePeerAvailabilityEnabled();
  const setToast = useSetToast();

  if (!enabled) return null;

  return (
    <MenuItem
      closeOnSelect
      data-geo-analytics-label="Profile menu copy availability link"
      data-geo-analytics-intent="copy_availability_link"
      onClick={async () => {
        try {
          await copyAvailabilityLink(profileSpaceId);
          setToast(<span>Availability link copied</span>);
        } catch {
          setToast(<span>Could not copy link.</span>);
        }
      }}
    >
      <p>Copy availability link</p>
    </MenuItem>
  );
}
