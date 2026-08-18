import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { CheckboxFilter } from './bounty-filters';

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
