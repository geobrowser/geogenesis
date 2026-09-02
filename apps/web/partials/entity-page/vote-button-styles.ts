/**
 * How an upvote / downvote button is coloured, picked or not (GEO-2792).
 *
 * `grey-03`, in both states. Being the one you picked is said by the icon filling in — an arrow, a
 * thumb — not by the colour changing. That is how the curation arrows on tables and Explore have
 * always worked, and it is the treatment the other surfaces had drifted away from:
 *
 * - the stance thumbs darkened to `grey-04` when picked
 * - the debates pill went `ctaPrimary` for up and `red-01` for down — blue and red, on the only
 *   surface in the app using either for this
 *
 * The veracity chevrons are the deliberate exception and keep their own darker selected state. A
 * chevron has no filled form to switch to, so colour is the only signal it has.
 *
 * One definition so the greys cannot drift apart again; the pill also rested a shade darker at
 * `grey-04`, which is the same divergence one state over.
 */
export const VOTE_BUTTON_CLASS = 'text-grey-03 hover:text-grey-04';

/**
 * The veracity chevrons' selected colour, kept exactly as it shipped.
 *
 * Not a token: `#2A2B2E` is a near-black written by hand in about a dozen files, ten units off the
 * theme's own `text` (`#202020`). Left alone here because this ticket is about the greys, but it is
 * the one hardcoded colour still in this control.
 */
export const VOTE_CHEVRON_SELECTED_CLASS = 'text-[#2A2B2E]';
