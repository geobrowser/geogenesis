'use client';

import * as React from 'react';

/**
 * A narrowing preference that steps back rather than landing the viewer on an empty list.
 *
 * "Matches only" is the setting most people want most of the time — the whole point of the hub is
 * finding someone to argue with now — but it is also the setting most likely to have nothing behind
 * it, because a match needs somebody else online holding the other side. Defaulting it on and
 * leaving it on means a viewer whose match list happens to be empty opens onto nothing, which reads
 * as the product being broken rather than as a filter being set.
 *
 * So the preference stands, and this decides whether it *applies* on arrival: on where there is
 * something to show, stepped back to the wider list where there is not.
 *
 * ## What it does not do
 *
 * It never writes the preference. The step back is this mount's alone, so a viewer who likes
 * matches keeps liking matches — tomorrow, when someone is online, they get matches again. Storing
 * the fallback would turn one quiet evening into a permanent change of mind, and over enough
 * evenings would walk every viewer off the setting they chose.
 *
 * It never steps back *up*, either. Once the wider list is what the viewer is reading, a match
 * arriving must not swap the list out from under them — this is a decision about arrival, and the
 * switch is right there for anyone who wants to make it again.
 *
 * And it decides only *once*, on the first answer it gets. The matches list is live — the gateway
 * invalidates it, and the rematch page polls positions — so a viewer who arrived on three matches
 * and watched the last one go offline would otherwise have been stepped back mid-read, which is the
 * same swap in the other direction. That is why the caller reports three states rather than a
 * boolean: "not yet" has to be distinguishable from "empty", or the decision cannot be taken at the
 * right moment and only then.
 *
 * ## `narrowed` is about the corpus, not the filters
 *
 * `'empty'` must mean "there is nothing here at all" — not "nothing matches the space and topic
 * filters". A viewer who has narrowed to one space and emptied the list has asked a question and
 * been answered; widening it for them discards the question. Their empty state already offers to
 * clear the filters, which is the undo that fits.
 *
 * A lookup that failed is `'pending'`, not `'empty'`: react-query drops `isLoading` on error, so an
 * outage reads exactly like a viewer with nobody to debate, and stepping back on it would take away
 * the list that carries the retry.
 */
/** What the narrowed list has come back with, if it has. */
export type NarrowedListState = 'pending' | 'empty' | 'filled';

export function useNarrowedDefault(
  preferred: boolean,
  narrowed: NarrowedListState,
  /**
   * Throws the decision away when it changes — this is a different list, about different people.
   *
   * The debate-again flow passes its session id, because that page is *reused* when the route moves
   * between rematches rather than remounted. Without it, a step back taken because one pair had no
   * match carried into the next pair, who may have several; and a viewer who pressed the switch for
   * one opponent had answered a question nobody asked about the next.
   *
   * Surfaces that die with their list — the hub's tabs — need none, and omitting it never resets.
   */
  resetKey?: string
): {
  /** Whether the narrowed list is the one to draw. */
  showNarrowed: boolean;
  /** Whether that is a step back from the stored preference rather than the preference itself. */
  steppedBack: boolean;
  /** Call when the viewer sets the preference themselves — their answer outranks this one. */
  rearm: () => void;
} {
  const [steppedBack, setSteppedBack] = React.useState(false);
  // Set once the viewer has answered the question this hook was guessing at, or once the list has
  // answered it for them, and never unset within a list. Both halves matter: without the first, a
  // viewer pressing "Matches only" over an empty match list would be stepped straight back out of
  // it on the very next render, and the press would look like it had missed. Without the second,
  // the decision would be retaken every time the live list changed.
  const [decided, setDecided] = React.useState(false);

  // During render, so the first render of the new list already decides for itself rather than
  // inheriting an answer given about the previous one.
  const lastResetKey = React.useRef(resetKey);
  if (lastResetKey.current !== resetKey) {
    lastResetKey.current = resetKey;
    if (steppedBack) setSteppedBack(false);
    if (decided) setDecided(false);
  }

  // During render, not in an effect. An effect would let the empty narrowed list paint for a commit
  // before the wider one replaced it, which is a flash of the exact emptiness this exists to avoid.
  // React re-renders on the spot for a set during render, so nothing downstream sees the interim
  // value. `decided` is what stops that being a loop, and what keeps it to one decision.
  if (!decided && narrowed !== 'pending') {
    setDecided(true);
    if (preferred && narrowed === 'empty') setSteppedBack(true);
  }

  // State rather than a ref, and not only for the paint. The switch reports the effective value, so
  // pressing it while stepped back sets the stored preference to what it already was — jotai writes
  // nothing and nothing re-renders, and the press would be swallowed. Clearing this is the change
  // that makes it move.
  const rearm = React.useCallback(() => {
    setDecided(true);
    setSteppedBack(false);
  }, []);

  return { showNarrowed: preferred && !steppedBack, steppedBack, rearm };
}
