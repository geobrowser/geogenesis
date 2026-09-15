/**
 * How an upvote / downvote button is coloured, picked or not (GEO-2792).
 *
 * `grey-04`, in both states. Being the one you picked is said by the icon filling in — an arrow, a
 * thumb — not by the colour changing. That was already how the curation arrows on tables and
 * Explore worked; what varied was the shade, and four surfaces had four answers:
 *
 * - curation arrows sat at `grey-03`, pinned on the icon rather than the button
 * - the stance thumbs rested at `grey-03` and darkened to `grey-04` when picked
 * - the debates pill rested at `grey-04` and went `ctaPrimary` for up, `red-01` for down — blue and
 *   red, on the only surface in the app using either for this
 *
 * `grey-04` rather than the lighter `grey-03` these mostly rested at, because these icons are the
 * control: they carry both the affordance and the selected state, so WCAG 1.4.11 asks 3:1 of them
 * against the white behind them. `grey-03` (`#B6B6B6`) gives 2.03:1 and fails; `grey-04`
 * (`#606060`) gives 6.29:1. The pill was already the one surface meeting it, which is why hover
 * borrows its `text` as well — a control resting at `grey-04` has to go somewhere darker still.
 *
 * The veracity chevrons are the deliberate exception and keep their own selected colour. A chevron
 * has no filled form to switch to, so colour is the only signal it has.
 *
 * One definition so these cannot drift apart again.
 */
export const VOTE_BUTTON_CLASS = 'text-grey-04 hover:text-text';

/**
 * The veracity chevrons' selected colour, kept exactly as it shipped.
 *
 * Not a token: `#2A2B2E` is a near-black written by hand in about a dozen files, ten units off the
 * theme's own `text` (`#202020`). Left alone because this ticket is about the greys, but it is the
 * one hardcoded colour still in this control.
 *
 * Applied *instead of* {@link VOTE_BUTTON_CLASS}, never alongside it. `cx` is `classnames`, which
 * concatenates — it does not resolve conflicting Tailwind utilities the way `tailwind-merge` would,
 * and this repo does not use that. Emitting both leaves the winner to whichever rule Tailwind
 * happens to emit second, which is not something a component gets to decide.
 */
export const VOTE_CHEVRON_SELECTED_CLASS = 'text-[#2A2B2E]';
