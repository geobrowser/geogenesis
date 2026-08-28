/**
 * The separator between an explore card's meta segments.
 *
 * Its own module because two card types now draw the same row, and a dot copied into the second one
 * is a dot that drifts: the spacing is carried by the glyph's own margins rather than by the row's
 * gap, so a claim card that reproduced it by eye ended up with the segments a different distance
 * apart from every card beside it.
 */
export function MetaDot() {
  return <span className="mx-[6px] shrink-0 text-[14px] leading-none text-[#2A2B2E]">·</span>;
}
