'use client';

import * as React from 'react';

import { useActionContext } from '~/core/action-context-provider';
import { copyAvailabilityLink } from '~/core/availability/availability-deep-link';
import { usePersonalSpaceId } from '~/core/hooks/use-personal-space-id';
import { usePeerAvailabilityEnabled } from '~/core/state/feature-flags';

/** How long the button reads "Link copied" before going back. */
const COPIED_MS = 2000;

/**
 * "Copy availability link" in the header of your own schedule editor.
 *
 * The link is to your profile, so it waits on your personal space and draws nothing without one.
 * Behind the booking flag, since booking is what the link opens onto.
 *
 * Confirms in place rather than with a toast: the schedule dialog sits above the toast layer (see
 * `scheduleDialog` in `core/z-layers`), so a toast would land underneath it.
 */
export function CopyOwnAvailabilityLinkButton() {
  // The personal-space read reaches into the wallet stack, so it is only mounted where the button
  // can actually show.
  return usePeerAvailabilityEnabled() ? <OwnLinkButton /> : null;
}

function OwnLinkButton() {
  const { personalSpaceId } = usePersonalSpaceId();
  // This control only appears in the schedule modal, which uses raw Radix primitives.
  const getContext = useActionContext('share_dialog', 'space', personalSpaceId ?? '', {
    overlay: 'modal',
    overlay_entity_id: personalSpaceId ?? undefined,
    overlay_entity_type: 'space',
  });
  const [state, setState] = React.useState<'idle' | 'copied' | 'failed'>('idle');

  React.useEffect(() => {
    if (state === 'idle') return;
    const timeout = setTimeout(() => setState('idle'), COPIED_MS);
    return () => clearTimeout(timeout);
  }, [state]);

  if (!personalSpaceId) return null;

  return (
    <button
      type="button"
      data-geo-analytics-label="Schedule editor copy availability link"
      data-geo-analytics-intent="copy_availability_link"
      onClick={async () => {
        try {
          await copyAvailabilityLink(personalSpaceId, getContext());
          setState('copied');
        } catch {
          setState('failed');
        }
      }}
      className="rounded-full border border-grey-02 px-3 py-1 text-metadata whitespace-nowrap text-text transition-colors hover:bg-grey-01"
    >
      {state === 'copied' ? 'Link copied' : state === 'failed' ? 'Couldn’t copy' : 'Copy availability link'}
    </button>
  );
}
