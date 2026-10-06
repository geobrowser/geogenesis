import type * as React from 'react';

/** Routing into a debate waits at most this long for the step-out; the server catches up anyway. */
const STEP_OUT_WAIT_MS = 2_000;

/** The lobby this tab is in, so routing into a debate can step out first. One per tab. */
let stepOutOfCurrentLobby: (() => Promise<void>) | null = null;

/** Set by the lobby page's presence; the returned function clears it. */
export function registerLobbyStepOut(stepOut: () => Promise<void>) {
  stepOutOfCurrentLobby = stepOut;
  return () => {
    if (stepOutOfCurrentLobby === stepOut) stepOutOfCurrentLobby = null;
  };
}

/**
 * Every way into a debate goes through here: steps out of this tab's lobby first so the unmount's
 * leave does not take the viewer off its roster. Synchronous outside a lobby.
 */
export function routeIntoDebate(go: () => void) {
  const stepOut = stepOutOfCurrentLobby;
  if (!stepOut) return go();
  void Promise.race([stepOut(), new Promise<void>(resolve => setTimeout(resolve, STEP_OUT_WAIT_MS))]).then(go);
}

/** For a `<Link>` into a debate: a plain click from a lobby steps out before navigating. */
export function debateEntryClick(navigate: () => void) {
  return (event: React.MouseEvent) => {
    if (!stepOutOfCurrentLobby || event.defaultPrevented || event.button !== 0) return;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    routeIntoDebate(navigate);
  };
}

const rejoinKey = 'geo.debates.lobby-rejoin';

/** Back to the room was pressed: the lobby page joins on arrival instead of asking again. */
export function requestLobbyRejoin(lobbyId: string) {
  try {
    window.sessionStorage.setItem(rejoinKey, lobbyId);
  } catch {
    // Without storage the lobby asks once more.
  }
}

/** Whether a rejoin was requested for this lobby; clears it either way. */
export function consumeLobbyRejoin(lobbyId: string): boolean {
  try {
    const requested = window.sessionStorage.getItem(rejoinKey);
    window.sessionStorage.removeItem(rejoinKey);
    return requested === lobbyId;
  } catch {
    return false;
  }
}
