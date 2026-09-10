'use client';

import { Toggle } from '~/design-system/toggle';

/**
 * "Matches only" (GEO-2861), as a switch rather than a pill.
 *
 * A switch because that is what it is: one setting with an on and an off, where the controls beside
 * it are menus that open. Drawn the way the debate room's "Publish debate?" switch is — the same
 * `Toggle` with its state spelled out beside it — so the two read as the same kind of control.
 *
 * `role="switch"` with `aria-checked` rather than a pressed button: it announces the state as on or
 * off, which is what this is, instead of as a button that happens to be held down.
 */
export function MatchesOnlySwitch({ checked, onChange }: { checked: boolean; onChange: (next: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label="Matches only"
      onClick={() => onChange(!checked)}
      className="flex min-h-7 shrink-0 cursor-pointer items-center gap-1.5 text-metadata text-grey-04"
    >
      <span>Matches only</span>
      <Toggle checked={checked} />
    </button>
  );
}
