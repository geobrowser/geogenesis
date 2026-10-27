'use client';

import * as React from 'react';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';

import { useSetToast } from '~/core/hooks/use-toast';
import { NavUtils } from '~/core/utils/utils';

import { lastPageOutsideDebates, rememberLastPageOutsideDebates } from '../debate-return-navigation';
import type { LobbyPresenceState } from './hooks';
import { type LobbyExit, lobbyLeft } from './lobby-analytics';
import type { GuestSessionState } from './lobby-guest-session';
import { useLobbyRoomPurpose } from './lobby-purpose';
import { LOBBY_STATE_COPY } from './lobby-state-cards';
import type { LobbyPageView } from './lobby-view';

/** Mounted once in the app shell: records each page outside the debate surfaces. */
export function LastPageOutsideDebatesTracker() {
  const pathname = usePathname();
  const search = useSearchParams().toString();

  React.useEffect(() => {
    rememberLastPageOutsideDebates();
  }, [pathname, search]);

  // A jump within the page (a block's anchor) changes neither, so follow the hash on its own.
  React.useEffect(() => {
    const remember = () => rememberLastPageOutsideDebates();
    window.addEventListener('hashchange', remember);
    return () => window.removeEventListener('hashchange', remember);
  }, []);

  return null;
}

/**
 * Where leaving this lobby goes: the page it was opened from, read once when the lobby page
 * mounts, or Explore when the tab came straight to the lobby.
 */
export function useLobbyExitHref() {
  const purpose = useLobbyRoomPurpose();
  const [href] = React.useState(() => lastPageOutsideDebates() ?? NavUtils.toExplore());
  // A space call goes back to its space.
  return purpose.purpose === 'call' ? purpose.exitHref : href;
}

type LobbyExitReason = 'left' | 'ended' | 'closed' | 'removed' | 'banned';

/**
 * The analytics exit for each way out (GEO-3311), as the heartbeat path reports it. Recorded here
 * too because a refetched view can close the lobby before the next heartbeat, and then admission
 * stops the heartbeat and the page's unmount would record a plain `left`.
 */
const ANALYTICS_EXIT: Record<LobbyExitReason, Exclude<LobbyExit, 'debate_started'>> = {
  left: 'left',
  ended: 'lobby_ended',
  closed: 'unknown',
  removed: 'unknown',
  banned: 'unknown',
};

type LobbyExitInput = {
  lobbyId: string;
  access: LobbyPageView['access'] | null;
  presence: LobbyPresenceState;
  guestStatus: GuestSessionState['status'];
  /** The lobby view was read on this page, not taken from the cache of an earlier visit. */
  fresh: boolean;
};

type LobbyExitSeen = {
  /** Joined, or listening as a guest, on this page. */
  inside: boolean;
  /** The lobby was open or scheduled on this page, so a close or a ban happened while here. */
  open: boolean;
};

/**
 * Why the viewer is out of a lobby they were in on this page, or null. Arriving at a lobby that
 * has already ended, banned them or removed them earlier keeps its own card.
 */
function lobbyExitReason(
  { access, presence, guestStatus }: Omit<LobbyExitInput, 'fresh' | 'lobbyId'>,
  seen: LobbyExitSeen
) {
  if (presence.status === 'left') return 'left';
  if (seen.inside && presence.status === 'dropped') return presence.reason;
  if (seen.inside && guestStatus === 'removed') return 'removed';
  if (seen.open && access?.status === 'closed') return access.reason === 'ended' ? 'ended' : 'closed';
  if (seen.open && access?.status === 'banned') return 'banned';
  return null;
}

function exitNotice(reason: LobbyExitReason, name: string) {
  switch (reason) {
    case 'left':
      return null;
    case 'ended':
    case 'closed':
    case 'removed':
      return LOBBY_STATE_COPY[reason];
    case 'banned':
      return LOBBY_STATE_COPY.bannedFrom(name);
  }
}

/**
 * Leaving, the lobby ending, or a host removing or banning the viewer takes them back to the page
 * they opened the lobby from, with a toast saying why when it was not their choice. Decided while
 * rendering, so the page can draw nothing instead of flashing the lobby's last card while the
 * route changes; returns whether it is leaving.
 */
export function useExitLobbyWhenOut(input: LobbyExitInput & { name: string | null; exitHref: string }) {
  const router = useRouter();
  const setToast = useSetToast();
  const { lobbyId, access, presence, guestStatus, fresh, name, exitHref } = input;

  const [seen, setSeen] = React.useState<LobbyExitSeen>({ inside: false, open: false });
  const inside = seen.inside || presence.status === 'joined' || guestStatus === 'listening';
  const open = seen.open || ((fresh || inside) && (access?.status === 'admitted' || access?.status === 'not_yet_open'));
  if (inside !== seen.inside || open !== seen.open) setSeen({ inside, open });

  // Latched: once leaving, a later render cannot bring the lobby back before the route changes.
  const [reason, setReason] = React.useState<LobbyExitReason | null>(null);
  const next = reason ?? lobbyExitReason({ access, presence, guestStatus }, { inside, open });
  if (next !== reason) setReason(next);

  const exitedRef = React.useRef(false);
  React.useEffect(() => {
    if (!reason || exitedRef.current) return;
    exitedRef.current = true;
    // Before the route change unmounts the page, whose unmount would otherwise end the visit as left.
    lobbyLeft(lobbyId, ANALYTICS_EXIT[reason]);
    const notice = exitNotice(reason, name ?? 'this lobby');
    if (notice) setToast(<span>{notice}</span>);
    router.replace(exitHref);
  }, [exitHref, lobbyId, name, reason, router, setToast]);

  return next !== null;
}
