/**
 * Past calls among Explore's cards (GEO-3421): after card `firstPosition`, then every `cadence`.
 * Client side, so feed pages and caches are untouched; a call never trails the feed.
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
