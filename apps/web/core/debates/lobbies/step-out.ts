import type * as React from 'react';

import { readSession, removeSession, writeSession } from '~/core/utils/session-storage';

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

/** Stops this tab's lobby camera, set while a lobby room may be publishing one. */
let releaseLobbyCamera: (() => void) | null = null;

/** Set by the lobby's voice room; the returned function clears it. */
export function registerLobbyCameraRelease(release: () => void) {
  releaseLobbyCamera = release;
  return () => {
    if (releaseLobbyCamera === release) releaseLobbyCamera = null;
  };
}

/**
 * Every way into a debate goes through here: steps out of this tab's lobby first so the unmount's
 * leave does not take the viewer off its roster. Synchronous outside a lobby.
 */
export function routeIntoDebate(go: () => void) {
  // Only the lobby being stepped out of now carries its mic; `stepOut` writes it.
  clearCarriedLobbyMic();
  // iPhone Safari keeps one camera capture: the lobby's must stop before the next screen opens its own.
  releaseLobbyCamera?.();
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

/**
 * The viewer's mic in this page's lobby: on, off, or null without a mic of their own there. Outlives
 * the voice connection, which a step-out from the server can take down before the route runs.
 */
let lobbyMic: boolean | null = null;

/** Reported by the lobby's voice connection whenever it changes. */
export function reportLobbyMic(on: boolean | null) {
  lobbyMic = on;
}

/** The lobby page is gone, and the mic it reported with it. */
export function forgetLobbyMic() {
  lobbyMic = null;
}

const carriedMicKey = 'geo.debates.lobby-mic';
/** Long enough for the step-out, the route and the picker's tab lock; short enough to mean "just now". */
const CARRIED_MIC_MAX_AGE_MS = 60_000;

type CarriedMic = { on: boolean; capturedAt: number };

/** The step-out's half: hands the lobby mic to the picker or ready room the viewer is routed into. */
export function carryLobbyMic() {
  if (lobbyMic === null) return;
  // Without storage the next screen starts with its own default.
  writeSession(carriedMicKey, JSON.stringify({ on: lobbyMic, capturedAt: Date.now() } satisfies CarriedMic));
}

/**
 * The mic the viewer had in the lobby they just stepped out of, or null. Left in place, so a render
 * that runs twice reads the same answer; `clearCarriedLobbyMic` spends it.
 */
export function readCarriedLobbyMic(): boolean | null {
  const raw = readSession(carriedMicKey);
  if (!raw) return null;
  try {
    const carried = JSON.parse(raw) as Partial<CarriedMic>;
    if (typeof carried.on !== 'boolean' || typeof carried.capturedAt !== 'number') return null;
    return Date.now() - carried.capturedAt > CARRIED_MIC_MAX_AGE_MS ? null : carried.on;
  } catch {
    return null;
  }
}

export function clearCarriedLobbyMic() {
  removeSession(carriedMicKey);
}
