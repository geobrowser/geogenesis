'use client';

import { dashlessId } from '../api';

const secretKey = (lobbyId: string) => `geo.debates.lobby-guest.${dashlessId(lobbyId)}`;

/** Kept per lobby for the tab's life, so a reload resumes the same guest and a removed one stays removed. */
export function readGuestSecret(lobbyId: string): string | null {
  try {
    return window.sessionStorage.getItem(secretKey(lobbyId));
  } catch {
    return null;
  }
}

export function storeGuestSecret(lobbyId: string, secret: string) {
  try {
    window.sessionStorage.setItem(secretKey(lobbyId), secret);
  } catch {
    // Without storage a reload takes a new place; the old one lapses in 90s.
  }
}

export function clearGuestSecret(lobbyId: string) {
  try {
    window.sessionStorage.removeItem(secretKey(lobbyId));
  } catch {
    // Nothing stored.
  }
}
