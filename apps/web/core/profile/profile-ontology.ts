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
 * A tagline as it should be stored: trimmed, and cut to the limit.
 *
 * Applied on input rather than on save, so the counter beside the field and the
 * value that publishes can never disagree. `slice` rather than a rejection —
 * a paste of 400 characters is someone with a headline to shorten, not an
 * error, and keeping the first 220 leaves them something to edit.
 */
export function normalizeTagline(value: string): string {
  return value.slice(0, TAGLINE_MAX_LENGTH);
}
