import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { CheckboxFilter, ScopeFilter } from './bounty-filters';

vi.stubGlobal(
  'ResizeObserver',
  class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
);

// Options arrive counted and ordered (facet counts against the other filters).
const OPTIONS = [
  { key: 'Easy', label: 'Easy', count: 3 },
  { key: 'Medium', label: 'Medium', count: 2 },
  { key: 'Hard', label: 'Hard', count: 0 },
];
const KEYS = OPTIONS.map(option => option.key);

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
    const menu = open(KEYS);

    fireEvent.click(menu.getByRole('menuitemcheckbox', { name: /Medium/ }));

    expect(lastSelection()).toEqual(['Easy', 'Hard']);
  });

  it('unticking the last option leaves an empty selection, which reads as Any', () => {
    const menu = open(['Easy']);

    fireEvent.click(menu.getByRole('menuitemcheckbox', { name: /Easy/ }));

    expect(lastSelection()).toEqual([]);
  });

  it('the Any row clears the selection (empty = any)', () => {
    const menu = open(['Easy']);

    fireEvent.click(menu.getByRole('menuitemcheckbox', { name: /Any difficulty/ }));

    expect(lastSelection()).toEqual([]);
  });

  it('shows the result count next to each option and disables zero-count options', () => {
    const menu = open([]);

    const easy = menu.getByRole('menuitemcheckbox', { name: /Easy/ });
    expect(within(easy).getByTestId('filter-count').textContent).toBe('3');
    const hard = menu.getByRole('menuitemcheckbox', { name: /Hard/ });
    expect(hard).toBeDisabled();
    fireEvent.click(hard);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('nests no buttons inside the menu rows', () => {
    open(KEYS);

    // A <button> inside a <button> is invalid HTML and trips a hydration error.
    expect(screen.getByRole('dialog').querySelectorAll('button button')).toHaveLength(0);
  });

  it('labels a full or empty selection as Any', () => {
    const { unmount } = render(
      <CheckboxFilter allLabel="Any difficulty" options={OPTIONS} selected={new Set(KEYS)} onChange={onChange} />
    );
    expect(screen.getByRole('button').textContent).toContain('Any difficulty');
    unmount();
    render(<CheckboxFilter allLabel="Any difficulty" options={OPTIONS} selected={new Set()} onChange={onChange} />);
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

describe('ScopeFilter', () => {
  it('shows counts per scope', () => {
    render(<ScopeFilter value="featured" onChange={onChange} counts={{ featured: 2, all: 9 }} />);
    fireEvent.click(screen.getByRole('button'));
    const menu = within(screen.getByRole('dialog'));
    expect(within(menu.getByRole('menuitemradio', { name: /Featured/ })).getByTestId('filter-count').textContent).toBe(
      '2'
    );
    expect(within(menu.getByRole('menuitemradio', { name: /All/ })).getByTestId('filter-count').textContent).toBe('9');
    fireEvent.click(menu.getByRole('menuitemradio', { name: /All/ }));
    expect(onChange).toHaveBeenCalledWith('all');
  });
});
