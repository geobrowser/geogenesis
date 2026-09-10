import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { UNFILTERED_BOUNTY_SCOPE } from './bounty-filters';
import { applyFilters, useBountyFilterState } from './community-bounties-sections';

vi.stubGlobal(
  'ResizeObserver',
  class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
);

afterEach(cleanup);

type Bounty = Parameters<typeof applyFilters>[0][number];

function bounty(id: string, isFeatured: boolean): Bounty {
  return { id, isFeatured, difficulty: null, skills: [] } as unknown as Bounty;
}

const BOUNTIES = [bounty('featured', true), bounty('plain', false)];
/** Empty sets read as "everything", so these leave only the scope doing any work. */
const ANY_DIFFICULTY = new Set<string>();
const ANY_SKILL = new Set<string>();

describe('the unfiltered bounty scope', () => {
  // The invariant "Show all" rests on. Asserted against the filter rather than against the
  // constant's value, so it still holds if the scopes are ever reordered or renamed — which is the
  // edit that would otherwise turn an empty state's escape hatch into a button that reproduces it.
  it('excludes nothing', () => {
    const kept = applyFilters(BOUNTIES, UNFILTERED_BOUNTY_SCOPE, ANY_DIFFICULTY, ANY_SKILL, []);

    expect(kept.map(entry => entry.id)).toEqual(['featured', 'plain']);
  });

  // The counterpart, so the case above cannot pass merely because the scope does nothing at all.
  it('is not Featured, which does exclude', () => {
    const kept = applyFilters(BOUNTIES, 'featured', ANY_DIFFICULTY, ANY_SKILL, []);

    expect(kept.map(entry => entry.id)).toEqual(['featured']);
  });
});

/**
 * The filter bar as a table actually wires it: the hook's own `controls`, and its `clearFilters`
 * standing in for the empty state's "Show all".
 *
 * Driven through the rendered pill rather than by calling a setter, because the pill is the only
 * way a viewer can reach this and the wiring between the two is part of what these cases are for.
 */
function FilterHarness({ bounties }: { bounties: Bounty[] }) {
  const { filtered, controls, clearFilters } = useBountyFilterState(bounties, []);

  return (
    <div>
      {controls}
      <button type="button" onClick={clearFilters}>
        Reset
      </button>
      <ul>
        {filtered.map(entry => (
          <li key={entry.id}>{entry.id}</li>
        ))}
      </ul>
    </div>
  );
}

const shown = () => screen.queryAllByRole('listitem').map(item => item.textContent);

function chooseScope(label: string) {
  // The trigger reads the current scope, so it is named after whatever is selected right now.
  fireEvent.click(screen.getByRole('button', { name: /^(All|Featured)$/ }));
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: label }));
}

describe('the bounties tables', () => {
  // The whole point of the change: a table used to open on Featured, so a curator's shortlist stood
  // in front of "what work is there" with nothing but a pill to say so. Asserted on what the table
  // shows rather than on the scope value, so it survives a rename of the scopes.
  it('open showing every bounty, not only the featured ones', () => {
    render(<FilterHarness bounties={BOUNTIES} />);

    expect(shown()).toEqual(['featured', 'plain']);
  });

  // Clearing has to *undo* something, so this starts from a genuinely filtered table. Clearing an
  // already-unfiltered one passes just as well when `clearFilters` does nothing at all, which is
  // what the first version of this case did.
  it('show every bounty again after a filter is cleared', () => {
    render(<FilterHarness bounties={BOUNTIES} />);

    chooseScope('Featured');
    expect(shown()).toEqual(['featured']);

    fireEvent.click(screen.getByRole('button', { name: 'Reset' }));

    expect(shown()).toEqual(['featured', 'plain']);
  });
});
