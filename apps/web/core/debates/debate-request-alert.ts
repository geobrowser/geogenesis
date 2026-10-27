import * as React from 'react';

/**
 * Tells someone a debate request has arrived when they are not looking at Geo (GEO-3026).
 *
 * Nothing did before. A challenge expires two minutes after it is sent, so anyone with Geo behind
 * another window, or in a background tab, never learned one had come — and the sender, watching it
 * time out, read the pool as full of people who were not there. On 2026-09-23 Susan sent four
 * requests in half an hour that nobody answered, and missed one herself that morning.
 *
 * Two signals, both needing no permission:
 * - **A tone**, once per request. The browser may refuse to start audio for a page the person has
 *   not interacted with; that is a refusal, not a fault, so it is swallowed.
 * - **A flashing tab title**, while this tab is hidden or unfocused. It stops, and the title is put
 *   back, as soon as the person returns or nothing is waiting any more.
 *
 * Several Geo tabs share one account, so a request is claimed in `localStorage` by whichever tab
 * sees it first, and only that tab plays the tone. Every tab still flashes, since any of them may be
 * the one the person looks at.
 */

export const REQUEST_ALERT_TITLE = 'Debate request';
const TITLE_FLASH_MS = 1_000;
const CLAIM_STORAGE_KEY = 'geo:debate-request-alerts';
/** Longer than any request lives, so a claim is never pruned while its request can still arrive. */
const CLAIM_TTL_MS = 60 * 60 * 1_000;

/**
 * Claims `requestId` for this tab. True the first time it is asked about, across tabs and reloads,
 * so the tone plays once per request rather than once per tab or per refresh.
 *
 * Storage can be missing, full or blocked (private windows, previews). Then there is nothing to
 * coordinate with, and every tab behaves as the only one: better a second tone than none.
 */
export function claimRequestAlert(requestId: string, now = Date.now(), storage: Storage | null = safeStorage()) {
  if (!storage) return true;
  try {
    const claims = parseClaims(storage.getItem(CLAIM_STORAGE_KEY));
    for (const [id, claimedAt] of Object.entries(claims)) {
      if (now - claimedAt > CLAIM_TTL_MS) delete claims[id];
    }
    if (requestId in claims) return false;
    claims[requestId] = now;
    storage.setItem(CLAIM_STORAGE_KEY, JSON.stringify(claims));
    return true;
  } catch {
    return true;
  }
}

function parseClaims(raw: string | null): Record<string, number> {
  if (!raw) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return {};
    return Object.fromEntries(
      Object.entries(parsed as Record<string, unknown>).filter(
        (entry): entry is [string, number] => typeof entry[1] === 'number'
      )
    );
  } catch {
    return {};
  }
}

function safeStorage(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
}

let audioContext: AudioContext | null = null;

/** Two short rising notes: distinct from a message ding, and quiet. */
export function playRequestTone() {
  try {
    const AudioContextClass =
      window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return;
    audioContext ??= new AudioContextClass();
    const context = audioContext;
    void context.resume().catch(() => undefined);

    const start = context.currentTime + 0.01;
    [880, 1318.5].forEach((frequency, index) => {
      const at = start + index * 0.16;
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = 'sine';
      oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0.0001, at);
      gain.gain.exponentialRampToValueAtTime(0.18, at + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.14);
      oscillator.connect(gain).connect(context.destination);
      oscillator.start(at);
      oscillator.stop(at + 0.15);
    });
  } catch {
    // Autoplay policy, no audio device, or no Web Audio at all: the title still flashes.
  }
}

function isAway() {
  return document.visibilityState === 'hidden' || !document.hasFocus();
}

function alertTitle(count: number) {
  return `(${count}) ${REQUEST_ALERT_TITLE}`;
}

/**
 * Alerts once for each id in `pendingRequestIds` the first time it appears, and flashes the tab
 * title while any are pending and the person is away.
 *
 * `pendingRequestIds` must be only requests *this viewer* has to answer: their incoming requests
 * and a challenge addressed to them. The coordinator already has both.
 */
export function useDebateRequestAlert(pendingRequestIds: readonly string[]) {
  const seenRef = React.useRef(new Set<string>());
  const [flashing, setFlashing] = React.useState(false);
  const count = pendingRequestIds.length;

  React.useEffect(() => {
    const fresh = pendingRequestIds.filter(id => !seenRef.current.has(id));
    if (fresh.length === 0) return;
    for (const id of fresh) seenRef.current.add(id);
    if (fresh.some(id => claimRequestAlert(id))) playRequestTone();
    if (isAway()) setFlashing(true);
  }, [pendingRequestIds]);

  React.useEffect(() => {
    if (count === 0) setFlashing(false);
  }, [count]);

  React.useEffect(() => {
    if (!flashing) return;
    const stopIfBack = () => {
      if (!isAway()) setFlashing(false);
    };
    window.addEventListener('focus', stopIfBack);
    document.addEventListener('visibilitychange', stopIfBack);
    return () => {
      window.removeEventListener('focus', stopIfBack);
      document.removeEventListener('visibilitychange', stopIfBack);
    };
  }, [flashing]);

  React.useEffect(() => {
    if (!flashing || count === 0) return;
    // Captured at the start and put back at the end, but only over this alert's own text: a title
    // something else set in the last second (a navigation, say) is left standing.
    const baseTitle = document.title;
    let showingAlert = false;
    const tick = () => {
      showingAlert = !showingAlert;
      document.title = showingAlert ? alertTitle(count) : baseTitle;
    };
    tick();
    const timer = window.setInterval(tick, TITLE_FLASH_MS);
    return () => {
      window.clearInterval(timer);
      if (document.title === alertTitle(count)) document.title = baseTitle;
    };
  }, [count, flashing]);
}
