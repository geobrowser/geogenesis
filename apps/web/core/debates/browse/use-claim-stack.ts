'use client';

import * as React from 'react';

/**
 * How long a claim card stays in the panel, in ms of the debate actually playing.
 *
 * Long enough to read a two-line claim, think, and answer: the over-the-video card's 8s linger was
 * routinely gone before the sentence was finished. Shown as a draining bar on the card, so how long
 * is left is never a surprise.
 */
export const CLAIM_CARD_MS = 20_000;
/** How often the cards' clocks advance. Short enough for the bar to read as continuous. */
export const CLAIM_CARD_TICK_MS = 100;

export type StackedClaim<T> = { id: string; claim: T; remainingMs: number };

/**
 * The claim cards waiting in the panel, newest first.
 *
 * A claim joins the stack the first time it surfaces and stays until its time runs out or the
 * viewer dismisses it — a newer claim no longer wipes the one being read. Answering does not remove
 * a card: the split it reveals is the reward, and the card goes when its time does.
 *
 * The clocks only run while `running` (the debate is playing) and the viewer is not holding the
 * stack (pointer over it, or focus in it), so reading or reaching for a button never loses a card.
 */
export function useClaimStack<T>({
  latest,
  idOf,
  running,
  max,
  resetKey,
}: {
  /** The claim surfacing right now, if any. */
  latest: T | null;
  idOf: (claim: T) => string;
  running: boolean;
  /** How many cards fit; the oldest goes when a newer one arrives past this. */
  max: number;
  /** A new debate starts a new stack. */
  resetKey: string;
}) {
  const [entries, setEntries] = React.useState<StackedClaim<T>[]>([]);
  const [held, setHeld] = React.useState(false);
  const seenRef = React.useRef(new Set<string>());

  React.useEffect(() => {
    seenRef.current = new Set();
    setEntries([]);
  }, [resetKey]);

  const latestId = latest ? idOf(latest) : null;
  React.useEffect(() => {
    if (!latest || latestId === null) return;
    if (seenRef.current.has(latestId)) {
      // The same claim again, with fresher lookups (its entity or row arriving): keep its clock.
      setEntries(current =>
        current.some(entry => entry.id === latestId)
          ? current.map(entry => (entry.id === latestId ? { ...entry, claim: latest } : entry))
          : current
      );
      return;
    }
    seenRef.current.add(latestId);
    setEntries(current => [{ id: latestId, claim: latest, remainingMs: CLAIM_CARD_MS }, ...current].slice(0, max));
  }, [latest, latestId, max]);

  const hasEntries = entries.length > 0;
  React.useEffect(() => {
    if (!running || held || !hasEntries) return;
    const timer = setInterval(
      () =>
        setEntries(current =>
          current
            .map(entry => ({ ...entry, remainingMs: entry.remainingMs - CLAIM_CARD_TICK_MS }))
            .filter(entry => entry.remainingMs > 0)
        ),
      CLAIM_CARD_TICK_MS
    );
    return () => clearInterval(timer);
  }, [running, held, hasEntries]);

  const dismiss = React.useCallback(
    (id: string) => setEntries(current => current.filter(entry => entry.id !== id)),
    []
  );

  return { entries, dismiss, setHeld };
}
