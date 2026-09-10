import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  BOUNTY_SCOPE_OPTIONS,
  CheckboxFilter,
  DEFAULT_BOUNTY_SCOPE,
  ScopeFilter,
  bountyScopeFromParam,
  writeBountyScopeParam,
} from './bounty-filters';

vi.stubGlobal(
  'ResizeObserver',
  class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
);

const OPTIONS = ['Easy', 'Medium', 'Hard'];

const onChange = vi.fn();

beforeEach(() => {
  onChange.mockReset();
});

afterEach(cleanup);

/** Opens the menu and scopes queries to it, so the trigger's own label can't match. */
function open(selected: string[]) {
  render(
    <CheckboxFilter allLabel="Any difficulty" options={OPTIONS} selected={new Set(selected)} onChange={onChange} />
  );

  fireEvent.click(screen.getByRole('button'));

  return within(screen.getByRole('dialog'));
}

function lastSelection(): string[] {
  return [...(onChange.mock.calls.at(-1)?.[0] as Set<string>)].sort();
}

describe('CheckboxFilter', () => {
  it('narrows the selection when an option is unticked', () => {
    const menu = open(OPTIONS);

    fireEvent.click(menu.getByText('Medium'));

    expect(lastSelection()).toEqual(['Easy', 'Hard']);
  });

  it('re-selects everything rather than emptying when the last option is unticked', () => {
    const menu = open(['Hard']);

    fireEvent.click(menu.getByText('Hard'));

    expect(lastSelection()).toEqual(['Easy', 'Hard', 'Medium']);
  });

  it('selects everything from the Any row', () => {
    const menu = open(['Easy']);

    fireEvent.click(menu.getByText('Any difficulty'));

    expect(lastSelection()).toEqual(['Easy', 'Hard', 'Medium']);
  });

  it('nests no buttons inside the menu rows', () => {
    const menu = open(OPTIONS);

    // A <button> inside a <button> is invalid HTML and trips a hydration error.
    expect(menu.getAllByRole('button').some(button => button.querySelector('button'))).toBe(false);
  });

  it('labels a full selection as Any', () => {
    render(
      <CheckboxFilter allLabel="Any difficulty" options={OPTIONS} selected={new Set(OPTIONS)} onChange={onChange} />
    );

    expect(screen.getByRole('button').textContent).toContain('Any difficulty');
  });

  it('labels a partial selection with the chosen options', () => {
    render(
      <CheckboxFilter
        allLabel="Any difficulty"
        options={OPTIONS}
        selected={new Set(['Easy', 'Hard'])}
        onChange={onChange}
      />
    );

    expect(screen.getByRole('button').textContent).toContain('Easy, Hard');
  });
});

describe('the bounty scope filter', () => {
  // The tables used to open on Featured, so every bounties table arrived already filtered to a
  // curator's shortlist — with nothing to say so but a pill that reads much like a label. "What
  // work is there" is the question someone lands on this tab with, so All leads and is the default.
  it('opens on All, with Featured kept as the second option', () => {
    expect(BOUNTY_SCOPE_OPTIONS.map(option => option.value)).toEqual(['all', 'featured']);
    expect(DEFAULT_BOUNTY_SCOPE).toBe('all');
  });

  // The default is read off the list rather than written out again, so reordering the options is
  // the whole of the change and the two cannot drift apart.
  it('takes its default from whichever option comes first', () => {
    expect(DEFAULT_BOUNTY_SCOPE).toBe(BOUNTY_SCOPE_OPTIONS[0].value);
  });

  it('shows the scopes in order, and reports the one picked', () => {
    const onScopeChange = vi.fn();
    render(<ScopeFilter value={DEFAULT_BOUNTY_SCOPE} onChange={onScopeChange} />);

    // The trigger reads the current scope, so an unfiltered table says "All" rather than "Featured".
    fireEvent.click(screen.getByRole('button', { name: 'All' }));
    const menu = within(screen.getByRole('dialog'));
    expect(menu.getAllByRole('button').map(button => button.textContent)).toEqual(['All', 'Featured']);

    fireEvent.click(menu.getByRole('button', { name: 'Featured' }));
    expect(onScopeChange).toHaveBeenCalledWith('featured');
  });

  // Both directions of the URL contract, which is the part of this change a reversed condition
  // would break silently — the pills would still look right while the link they produce did not.
  describe('the scope query param', () => {
    it('reads a missing or unrecognised value as the default', () => {
      expect(bountyScopeFromParam(null)).toBe(DEFAULT_BOUNTY_SCOPE);
      expect(bountyScopeFromParam('')).toBe(DEFAULT_BOUNTY_SCOPE);
      expect(bountyScopeFromParam('nonsense')).toBe(DEFAULT_BOUNTY_SCOPE);
    });

    // `all` is a real scope, not an unknown one: a link written before All became the default is
    // read as itself and keeps working.
    it('reads each real scope as itself, legacy links included', () => {
      expect(bountyScopeFromParam('all')).toBe('all');
      expect(bountyScopeFromParam('featured')).toBe('featured');
    });

    it('writes only a non-default scope, and clears a stale one', () => {
      const featured = new URLSearchParams();
      writeBountyScopeParam(featured, 'featured');
      expect(featured.get('scope')).toBe('featured');

      // The default is expressed by absence, so switching back to it removes what was there.
      const cleared = new URLSearchParams('scope=featured&difficulty=Easy');
      writeBountyScopeParam(cleared, DEFAULT_BOUNTY_SCOPE);
      expect(cleared.get('scope')).toBeNull();
      // Only the scope is this function's business.
      expect(cleared.get('difficulty')).toBe('Easy');
    });

    // The round trip, so the two directions cannot drift apart.
    it.each(BOUNTY_SCOPE_OPTIONS.map(option => option.value))('round-trips %s', scope => {
      const params = new URLSearchParams();
      writeBountyScopeParam(params, scope);

      expect(bountyScopeFromParam(params.get('scope'))).toBe(scope);
    });
  });
});
