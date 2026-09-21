'use client';

import { useDeepLinkEffect, useDeepLinkParams } from '~/core/deep-links/use-deep-link';
import { useToast } from '~/core/hooks/use-toast';

import { ROOM_ACCESS_MODAL, roomAccessDenial } from './room-access-deep-link';
import { ROOM_NO_ACCESS } from './room-copy';

/** Why the room would not let the viewer in (GEO-2941). A toast: they have already been moved. */
export function useRoomAccessDeepLink() {
  const [, setToast] = useToast();
  const link = useDeepLinkParams(ROOM_ACCESS_MODAL);
  const denial = roomAccessDenial(link.target);

  useDeepLinkEffect({
    ...link,
    // Without a reason the trigger stays in the URL rather than being cleared for a message that
    // never rendered.
    enabled: denial !== null,
    run: () => setToast(<>{denial === 'ended' ? ROOM_NO_ACCESS.ended : ROOM_NO_ACCESS.denied}</>),
  });
}
