import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DataBlockSortMenu } from './data-block-sort-menu';

/**
 * The menu's two steps: pick what to sort by, then pick a direction. Built-in sorts (Best, Created)
 * sit above the properties and go through the same direction step a property does, so choosing
 * Best never applies an order by itself.
 */
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

const trigger = () => screen.getByRole('button', { name: 'Sort' });

/** Radix opens a dropdown trigger on Enter; the content mounts in a portal with `role="menu"`. */
function openMenu() {
  fireEvent.keyDown(trigger(), { key: 'Enter' });
  return within(screen.getByRole('menu'));
}

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', ResizeObserverStub);
  Element.prototype.hasPointerCapture ??= () => false;
  Element.prototype.setPointerCapture ??= () => {};
  Element.prototype.releasePointerCapture ??= () => {};
  Element.prototype.scrollIntoView ??= () => {};
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('DataBlockSortMenu', () => {
  it('lists the built-in sorts above the properties', () => {
    render(<DataBlockSortMenu properties={[]} sortState={null} onSort={vi.fn()} />);

    const rows = openMenu()
      .getAllByRole('button')
      .map(button => button.textContent?.trim());

    expect(rows).toEqual(['Best', 'Created', 'Name', 'Description', 'Score']);
  });

  it('applies Best only after a direction is chosen', async () => {
    const onSort = vi.fn();
    render(<DataBlockSortMenu properties={[]} sortState={null} onSort={onSort} />);

    const menu = openMenu();
    fireEvent.click(menu.getByRole('button', { name: 'Best' }));

    expect(onSort).not.toHaveBeenCalled();
    expect(menu.getByRole('button', { name: 'Back' })).toBeInTheDocument();
    expect(menu.queryByRole('button', { name: 'Created' })).not.toBeInTheDocument();

    fireEvent.click(menu.getByRole('button', { name: 'Ascending' }));

    expect(onSort).toHaveBeenCalledTimes(1);
    expect(onSort).toHaveBeenCalledWith({ kind: 'builtin', sort: 'best', direction: 'asc' });
    await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument());
  });

  it('applies a property with the chosen direction', () => {
    const onSort = vi.fn();
    render(<DataBlockSortMenu properties={[]} sortState={null} onSort={onSort} />);

    const menu = openMenu();
    fireEvent.click(menu.getByRole('button', { name: 'Name' }));
    fireEvent.click(menu.getByRole('button', { name: 'Descending' }));

    expect(onSort).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'property', direction: 'desc', columnId: expect.any(String) })
    );
  });

  it('forgets a half-finished direction step when the menu closes', async () => {
    render(<DataBlockSortMenu properties={[]} sortState={null} onSort={vi.fn()} />);

    const menu = openMenu();
    fireEvent.click(menu.getByRole('button', { name: 'Created' }));
    expect(menu.getByRole('button', { name: 'Back' })).toBeInTheDocument();

    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument());

    const reopened = openMenu();
    expect(reopened.getByRole('button', { name: 'Best' })).toBeInTheDocument();
    expect(reopened.getByRole('button', { name: 'Created' })).toBeInTheDocument();
    expect(reopened.queryByRole('button', { name: 'Back' })).not.toBeInTheDocument();
  });
});
