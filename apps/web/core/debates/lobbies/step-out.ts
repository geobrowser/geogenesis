import type * as React from 'react';
import { useSyncExternalStore } from 'react';

import { readSession, removeSession, writeSession } from '~/core/utils/session-storage';

import type { DebateJoinChoice } from '../request-join-state';

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

export type LobbyCaptureKind = 'audio' | 'video';

/** A device the lobby is capturing: whether it is on (unmuted) and how to stop it. */
export type LobbyCapture = { on: boolean; release: () => void };

/** Devices this tab's lobby is capturing. iPhone Safari keeps one capture per kind. */
const lobbyCaptures = new Map<LobbyCaptureKind, LobbyCapture>();
const lobbyCaptureListeners = new Set<() => void>();

function notifyLobbyCaptures() {
  lobbyCaptureListeners.forEach(listener => listener());
}

/** Set by the lobby's voice room while it holds a capture of `kind`; the returned function clears it. */
export function registerLobbyCapture(kind: LobbyCaptureKind, capture: LobbyCapture) {
  lobbyCaptures.set(kind, capture);
  notifyLobbyCaptures();
  return () => {
    if (lobbyCaptures.get(kind) !== capture) return;
    lobbyCaptures.delete(kind);
    notifyLobbyCaptures();
  };
}

/** Whether the lobby holds a capture of `kind`, or of any kind when omitted. */
export function lobbyCaptureLive(kind?: LobbyCaptureKind) {
  return kind ? lobbyCaptures.has(kind) : lobbyCaptures.size > 0;
}

/** Stops the lobby's capture of `kind`, or every capture when omitted. */
export function releaseLobbyCapture(kind?: LobbyCaptureKind) {
  for (const [captured, capture] of [...lobbyCaptures]) {
    if (!kind || captured === kind) capture.release();
  }
}

function subscribeLobbyCaptures(listener: () => void) {
  lobbyCaptureListeners.add(listener);
  return () => {
    lobbyCaptureListeners.delete(listener);
  };
}

/** The lobby's capture of `kind`, or null; re-renders as the lobby connects, mutes or lets it go. */
export function useLobbyCapture(kind: LobbyCaptureKind): LobbyCapture | null {
  return useSyncExternalStore(
    subscribeLobbyCaptures,
    () => lobbyCaptures.get(kind) ?? null,
    () => null
  );
}

/**
 * Every way into a debate goes through here: steps out of this tab's lobby first so the unmount's
 * leave does not take the viewer off its roster. Synchronous outside a lobby.
 */
export function routeIntoDebate(go: () => void) {
  // Only the lobby being stepped out of now carries its devices; `stepOut` writes them.
  clearCarriedLobbyChoice();
  // Read first: releasing the capture turns the lobby's camera off.
  cameraAtStepOut = lobbyCamera;
  // iPhone Safari keeps one camera capture: the lobby's must stop before the next screen opens its own.
  releaseLobbyCapture('video');
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
 * The viewer's mic and camera in this page's lobby: on, off, or null without one of their own there.
 * Outlive the voice connection, which a step-out from the server can take down before the route runs.
 */
let lobbyMic: boolean | null = null;
let lobbyCamera: boolean | null = null;
/** The camera as it was before `routeIntoDebate` released it. */
let cameraAtStepOut: boolean | null = null;

/** Reported by the lobby's voice connection whenever it changes. */
export function reportLobbyMic(on: boolean | null) {
  lobbyMic = on;
}

/** Reported by the lobby's voice connection; null without the camera (a mic-only token). */
export function reportLobbyCamera(on: boolean | null) {
  lobbyCamera = on;
}

/** The lobby page is gone, and the devices it reported with it. */
export function forgetLobbyDevices() {
  lobbyMic = null;
  lobbyCamera = null;
}

const carriedKey = 'geo.debates.lobby-mic';
/** Long enough for the step-out, the route and the picker's tab lock; short enough to mean "just now". */
const CARRIED_MAX_AGE_MS = 60_000;

type Carried = { on: boolean; camera?: boolean; capturedAt: number };

/** The step-out's half: hands the lobby's mic, and camera if it had one, to the picker or ready room. */
export function carryLobbyJoinChoice() {
  if (lobbyMic === null) return;
  const camera = cameraAtStepOut ?? lobbyCamera;
  const carried: Carried = { on: lobbyMic, capturedAt: Date.now() };
  if (camera !== null) carried.camera = camera;
  // Without storage the next screen starts with its own default.
  writeSession(carriedKey, JSON.stringify(carried));
}

/**
 * The mic and camera the viewer had in the lobby they just stepped out of, or null. Left in place,
 * so a render that runs twice reads the same answer; `clearCarriedLobbyChoice` spends it.
 */
export function readCarriedLobbyChoice(): DebateJoinChoice | null {
  const raw = readSession(carriedKey);
  if (!raw) return null;
  try {
    const carried = JSON.parse(raw) as Partial<Carried>;
    if (typeof carried.on !== 'boolean' || typeof carried.capturedAt !== 'number') return null;
    if (Date.now() - carried.capturedAt > CARRIED_MAX_AGE_MS) return null;
    return typeof carried.camera === 'boolean'
      ? { micOn: carried.on, cameraOn: carried.camera }
      : { micOn: carried.on };
  } catch {
    return null;
  }
}

export function clearCarriedLobbyChoice() {
  removeSession(carriedKey);
}
