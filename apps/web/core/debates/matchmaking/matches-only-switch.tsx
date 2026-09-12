'use client';

import { FilterSwitch } from './filter-switch';

/**
 * "Matches only" (GEO-2861) — claims where someone holding the opposite side is ready to debate.
 *
 * A named wrapper rather than a `FilterSwitch` at each call site: three surfaces draw this same
 * setting, and the label is what identifies it to a viewer and to a test.
 */
export function MatchesOnlySwitch({ checked, onChange }: { checked: boolean; onChange: (next: boolean) => void }) {
  return <FilterSwitch label="Matches only" checked={checked} onChange={onChange} />;
}
