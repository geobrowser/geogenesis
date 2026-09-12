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
 * ## `emptyNarrowed` is about the corpus, not the filters
 *
 * Callers must pass "there is nothing here at all", settled — not "nothing matches the space and
 * topic filters". A viewer who has narrowed to one space and emptied the list has asked a question
 * and been answered; widening it for them discards the question. Their empty state already offers
 * to clear the filters, which is the undo that fits.
 */
export function useNarrowedDefault(
  preferred: boolean,
  emptyNarrowed: boolean
): {
  /** Whether the narrowed list is the one to draw. */
  narrowed: boolean;
  /** Whether that is a step back from the stored preference rather than the preference itself. */
  steppedBack: boolean;
  /** Call when the viewer sets the preference themselves — their answer outranks this one. */
  rearm: () => void;
} {
  const [steppedBack, setSteppedBack] = React.useState(false);
  // Set once the viewer has answered the question this hook was guessing at, and never unset. Both
  // halves matter: without it, a viewer pressing "Matches only" over an empty match list would be
  // stepped straight back out of it on the very next render, and the press would look like it had
  // missed.
  const [chosen, setChosen] = React.useState(false);

  // During render, not in an effect. An effect would let the empty narrowed list paint for a commit
  // before the wider one replaced it, which is a flash of the exact emptiness this exists to avoid.
  // React re-renders on the spot for a set during render, so nothing downstream sees the interim
  // value. The `!steppedBack` guard is what stops that being a loop.
  if (!chosen && !steppedBack && preferred && emptyNarrowed) setSteppedBack(true);

  // State rather than a ref, and not only for the paint. The switch reports the effective value, so
  // pressing it while stepped back sets the stored preference to what it already was — jotai writes
  // nothing and nothing re-renders, and the press would be swallowed. Clearing this is the change
  // that makes it move.
  const rearm = React.useCallback(() => {
    setChosen(true);
    setSteppedBack(false);
  }, []);

  return { narrowed: preferred && !steppedBack, steppedBack, rearm };
}
