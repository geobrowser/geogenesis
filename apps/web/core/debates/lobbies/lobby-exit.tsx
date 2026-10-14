'use client';

import * as React from 'react';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';

import { useSetToast } from '~/core/hooks/use-toast';
import { NavUtils } from '~/core/utils/utils';

import { lastPageOutsideDebates, rememberLastPageOutsideDebates } from '../debate-return-navigation';
import type { LobbyPresenceState } from './hooks';
import type { GuestSessionState } from './lobby-guest-session';
import { LOBBY_STATE_COPY } from './lobby-state-cards';
import type { LobbyPageView } from './lobby-view';

/** Mounted once in the app shell: records each page outside the debate surfaces. */
export function LastPageOutsideDebatesTracker() {
  const pathname = usePathname();
  const search = useSearchParams().toString();

  React.useEffect(() => {
    rememberLastPageOutsideDebates();
  }, [pathname, search]);

  return null;
}

/**
 * Where leaving this lobby goes: the page it was opened from, read once when the lobby page
 * mounts, or Explore when the tab came straight to the lobby.
 */
export function useLobbyExitHref() {
  const [href] = React.useState(() => lastPageOutsideDebates() ?? NavUtils.toExplore());
  return href;
}

export type LobbyExitReason = 'left' | 'ended' | 'closed' | 'removed' | 'banned';

export const LOBBY_EXIT_COPY = {
  removed: 'A host removed you from this lobby.',
} as const;

type LobbyExitInput = {
  access: LobbyPageView['access'] | null;
  presence: LobbyPresenceState;
  guestStatus: GuestSessionState['status'];
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
export function lobbyExitReason({ access, presence, guestStatus }: LobbyExitInput, seen: LobbyExitSeen) {
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
      return LOBBY_STATE_COPY.ended;
    case 'closed':
      return LOBBY_STATE_COPY.closed;
    case 'removed':
      return LOBBY_EXIT_COPY.removed;
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
  const { access, presence, guestStatus, name, exitHref } = input;

  const [seen, setSeen] = React.useState<LobbyExitSeen>({ inside: false, open: false });
  const inside = seen.inside || presence.status === 'joined' || guestStatus === 'listening';
  const open = seen.open || access?.status === 'admitted' || access?.status === 'not_yet_open';
  if (inside !== seen.inside || open !== seen.open) setSeen({ inside, open });

  // Latched: once leaving, a later render cannot bring the lobby back before the route changes.
  const [reason, setReason] = React.useState<LobbyExitReason | null>(null);
  const next = reason ?? lobbyExitReason({ access, presence, guestStatus }, { inside, open });
  if (next !== reason) setReason(next);

  const exitedRef = React.useRef(false);
  React.useEffect(() => {
    if (!reason || exitedRef.current) return;
    exitedRef.current = true;
    const notice = exitNotice(reason, name ?? 'this lobby');
    if (notice) setToast(<span>{notice}</span>);
    router.replace(exitHref);
  }, [exitHref, name, reason, router, setToast]);

  return next !== null;
}
