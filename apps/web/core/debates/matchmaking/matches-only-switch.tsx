'use client';

import { FilterSwitch } from './filter-switch';
import type { DebateAnalyticsSurface } from './hub-analytics';

type SwitchProps = {
  checked: boolean;
  onChange: (next: boolean) => void;
  analyticsSurface: DebateAnalyticsSurface;
};

/**
 * "Matches only" (GEO-2861) — claims where someone holding the opposite side is ready to debate.
 *
 * A named wrapper rather than a `FilterSwitch` at each call site, for the same reason as the one
 * below: the hub and the debate-again flow both draw it, and the label is what identifies the
 * setting to a viewer and to a test. Written once, it cannot drift between them.
 */
export function MatchesOnlySwitch({ checked, onChange, analyticsSurface }: SwitchProps) {
  return (
    <FilterSwitch label="Matches only" checked={checked} onChange={onChange} analyticsSurface={analyticsSurface} />
  );
}

/**
 * "Hide my positions" (GEO-2863) — the claims the viewer has already taken a side on, out of the
 * way of the ones they have not.
 *
 * The two surfaces disagree about its default and about what happens to a claim answered under the
 * viewer — see the atoms — but they are the same setting, said the same way. Which is exactly what
 * a shared label is for.
 */
export function HideMyPositionsSwitch({ checked, onChange, analyticsSurface }: SwitchProps) {
  return (
    <FilterSwitch label="Hide my positions" checked={checked} onChange={onChange} analyticsSurface={analyticsSurface} />
  );
}
