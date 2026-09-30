/**
 * The white pill a debate's actions wear: the claims, comments and share pills under the video, and
 * the end card's replay.
 *
 * Shared so the replay reads as one of the debate's actions and cannot drift from the pills it is
 * drawn to match. Layout only — each caller sets its own gap, padding and type.
 */
export const PILL_ACTION_CLASS =
  'flex h-7 items-center rounded-full border border-grey-02 bg-white text-grey-04 shadow-light transition-colors hover:text-text';
