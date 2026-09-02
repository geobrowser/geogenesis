/**
 * How an upvote / downvote button says it is the one you picked (GEO-2792).
 *
 * One constant, because four surfaces had four answers and none of them referenced the others:
 *
 * - curation arrows on tables and entity pages said it with `fill` alone, leaving the arrow
 *   `grey-03` whether or not you had voted
 * - the stance thumbs said `text-grey-04`
 * - the veracity chevrons said `text-[#2A2B2E]`, which is not a token — it is a near-black used
 *   informally in a dozen files, ten units off the one the theme actually defines
 * - the debates pill said `ctaPrimary` for up and `red-01` for down: blue and red, on the only
 *   surface that used either
 *
 * `text` is the theme's own ink (`#202020`), which is what the chevrons were reaching for when
 * they wrote `#2A2B2E` by hand. Selected means ink; everything else stays grey. The direction is
 * already carried by the icon — an arrow, a thumb or a chevron, and its filled shape — so colour
 * does not have to say it a second time, which is why up and down converge on one value rather
 * than keeping the pill's blue/red pair.
 *
 * The resting and hover greys are deliberately *not* here. They differ by surface for a reason the
 * selected state does not share: the pill sits on white with a border and rests at `grey-04`,
 * while an inline row rests at the lighter `grey-03`. That is contrast against different
 * backgrounds, not a disagreement about what "picked" looks like.
 */
export const VOTE_SELECTED_CLASS = 'text-text';
