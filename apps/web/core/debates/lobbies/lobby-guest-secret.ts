'use client';

import { dashlessId } from '../api';

const secretKey = (lobbyId: string) => `geo.debates.lobby-guest.${dashlessId(lobbyId)}`;

/**
 * Kept per lobby and shared by every tab, so a reload or another tab resumes the same guest (one
 * place per browser) and a removed one stays removed.
 */
export function readGuestSecret(lobbyId: string): string | null {
  try {
    return window.localStorage.getItem(secretKey(lobbyId));
  } catch {
    return null;
  }
}

export function storeGuestSecret(lobbyId: string, secret: string) {
  try {
    window.localStorage.setItem(secretKey(lobbyId), secret);
  } catch {
    // Without storage a reload takes a new place; the old one lapses in 90s.
  }
}

export function clearGuestSecret(lobbyId: string) {
  try {
    window.localStorage.removeItem(secretKey(lobbyId));
  } catch {
    // Nothing stored.
  }
}
