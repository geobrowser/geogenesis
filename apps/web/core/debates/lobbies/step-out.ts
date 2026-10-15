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
  if (!stepOut) {
    // Only a route straight out of a lobby carries its mic; an older one must not leak into this.
    clearCarriedLobbyMic();
    return go();
  }
  carryLobbyMic();
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
  let requested: string | null = null;
  try {
    requested = window.sessionStorage.getItem(rejoinKey);
  } catch {
    return false;
  }
  clearLobbyRejoin();
  return requested === lobbyId;
}

export function clearLobbyRejoin() {
  try {
    window.sessionStorage.removeItem(rejoinKey);
  } catch {
    // Nothing to clear when storage is unavailable.
  }
}

/** The lobby mic as this tab has it: on or off, or null when there is no mic of the viewer's here. */
let readCurrentLobbyMic: (() => boolean | null) | null = null;

/** Set by the lobby's voice connection; the returned function clears it. */
export function registerLobbyMic(read: () => boolean | null) {
  readCurrentLobbyMic = read;
  return () => {
    if (readCurrentLobbyMic === read) readCurrentLobbyMic = null;
  };
}

const carriedMicKey = 'geo.debates.lobby-mic';
/** Long enough for the step-out, the route and the picker's tab lock; short enough to mean "just now". */
const CARRIED_MIC_MS = 60_000;

/** Called on the way out of a lobby, before the step-out takes the lobby mic down. */
function carryLobbyMic() {
  const on = readCurrentLobbyMic?.() ?? null;
  try {
    if (on === null) window.sessionStorage.removeItem(carriedMicKey);
    else window.sessionStorage.setItem(carriedMicKey, JSON.stringify({ on, at: Date.now() }));
  } catch {
    // Without storage the next screen starts with its own default.
  }
}

/**
 * The mic the viewer had in the lobby they just left, for the picker or ready room to start with.
 * Null when they did not come straight from a lobby with a mic of their own. Leaves it in place,
 * so a render that runs twice reads the same answer; `clearCarriedLobbyMic` spends it.
 */
export function readCarriedLobbyMic(): boolean | null {
  try {
    const raw = window.sessionStorage.getItem(carriedMicKey);
    if (!raw) return null;
    const carried: unknown = JSON.parse(raw);
    if (typeof carried !== 'object' || carried === null) return null;
    const { on, at } = carried as { on?: unknown; at?: unknown };
    if (typeof on !== 'boolean' || typeof at !== 'number') return null;
    if (Date.now() - at > CARRIED_MIC_MS) return null;
    return on;
  } catch {
    return null;
  }
}

export function clearCarriedLobbyMic() {
  try {
    window.sessionStorage.removeItem(carriedMicKey);
  } catch {
    // Nothing to clear when storage is unavailable.
  }
}
