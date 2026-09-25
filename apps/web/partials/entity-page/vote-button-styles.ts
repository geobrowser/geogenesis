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
 * There used to be one exception — the veracity chevrons kept their own selected colour, because a
 * chevron has no filled form to switch to and colour was the only signal it had. Claims are all
 * answered with thumbs now, so every control here fills its icon and this is the only shade.
 *
 * One definition so these cannot drift apart again.
 */
export const VOTE_BUTTON_CLASS = 'text-grey-04 hover:text-text';
