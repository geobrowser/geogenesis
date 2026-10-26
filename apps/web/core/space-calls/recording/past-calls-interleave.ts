/**
 * Where published past calls sit among Explore's cards (GEO-3421), on the fresh slot's rule
 * (`merge-fresh-slot`): the first after card `firstPosition`, then one every `cadence` cards. Client
 * side, between cards the server already paged, so feed pages, cursors and caches are untouched.
 * A call never trails the feed: one goes in only after a card that is there.
 */
export type PastCallSlots = { firstPosition: number; cadence: number };

export const PAST_CALL_SLOTS: PastCallSlots = { firstPosition: 4, cadence: 10 };

/** Feed index (0-based) → past call index, for `feedLength` cards and `callCount` calls. */
export function pastCallSlots(
  feedLength: number,
  callCount: number,
  { firstPosition, cadence }: PastCallSlots = PAST_CALL_SLOTS
): Map<number, number> {
  const slots = new Map<number, number>();
  if (cadence < 1 || firstPosition < 1) return slots;
  for (let call = 0; call < callCount; call += 1) {
    const afterIndex = firstPosition - 1 + call * cadence;
    if (afterIndex >= feedLength) break;
    slots.set(afterIndex, call);
  }
  return slots;
}
