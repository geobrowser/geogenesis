/**
 * Properties a person states about themselves on their own profile, beyond the
 * ones the SDK already names.
 *
 * Work and Education live in `history-ontology.ts` — that shape is three levels
 * deep and earns its own file. These are plain values on the person entity.
 */

/**
 * The one-line headline under a person's name.
 *
 * Read back from the graph before being written down —
 * `entities(filter: { id: { in: ["0e4f7b40c0924badb5d5ca10bcb60aa9"] } }) { id name }`
 * on 2026-09-25 — which answered `Tagline`, a `Property` whose `Data type` is
 * `Text`. A wrong id here writes a value nobody can read.
 */
export const TAGLINE_PROPERTY = '0e4f7b40c0924badb5d5ca10bcb60aa9';

/**
 * How long a tagline may be, enforced by every field that writes one.
 *
 * 220 characters, as LinkedIn caps its headline at. Nothing in the graph
 * enforces it — a tagline written by any other client can be longer, and the
 * surfaces that read one truncate rather than reject it. The limit is about
 * what this app asks someone to write: a line that fits under a name.
 */
export const TAGLINE_MAX_LENGTH = 220;

/**
 * A tagline cut to the limit.
 *
 * Deliberately no trimming: this runs on every keystroke in the in-place field, and stripping
 * the trailing space would make "Head of " impossible to type. The surfaces that publish trim
 * separately, where trimming once is the whole of it.
 *
 * `slice` rather than a rejection — a paste of 400 characters is someone with a headline to
 * shorten, not an error, and keeping the first 220 leaves them something to edit.
 */
export function normalizeTagline(value: string): string {
  const cut = value.slice(0, TAGLINE_MAX_LENGTH);

  // Nothing was removed, so there is no boundary to have landed in the middle of.
  if (cut.length === value.length) return cut;

  // `slice` counts UTF-16 code units, and an emoji is two of them. Cutting at 220 can land
  // between the halves of one and leave the first behind: 219 letters and an emoji come back
  // as 219 letters and a lone high surrogate, which is not valid text at all — it renders as a
  // replacement character and is stored that way. Drop the orphan rather than publish it.
  //
  // Only a *high* surrogate can be orphaned this way; a trailing low surrogate has its partner
  // in front of it, inside the slice.
  const last = cut.charCodeAt(cut.length - 1);
  if (last >= 0xd800 && last <= 0xdbff) return cut.slice(0, -1);

  return cut;
}

/**
 * What to say beside a tagline field about the room it has left.
 *
 * Shared by the two fields that write a tagline — the header and the Edit profile modal — so
 * the same length means the same sentence in both.
 *
 * Counts down rather than up: `12/220` asks the reader to do the subtraction, and the number
 * they want is how much room is left.
 *
 * Over the limit is reachable without typing — by opening a tagline written before this limit
 * existed, or by another client. Both fields show such a value as it really is rather than
 * silently cut, so this says what will happen to it; "0 left" over 260 characters of text
 * would read as a broken counter instead. Editing is what shortens it, in both places: the
 * field cuts on change, and a field nobody touched is published untouched.
 */
export function taglineLengthHint(value: string): string {
  const remaining = TAGLINE_MAX_LENGTH - value.length;

  if (remaining < 0) return `Over the ${TAGLINE_MAX_LENGTH}-character limit — editing this will shorten it`;

  return `${remaining} character${remaining === 1 ? '' : 's'} left`;
}
