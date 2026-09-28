import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { SearchResult } from '~/core/types';

import { SelectEntity } from './select-entity';

/**
 * Everything this component reaches for beyond rendering a box and a list. The
 * behaviour under test is which keys it answers and when, which none of these
 * take part in.
 */
vi.mock('~/core/hooks/use-search', () => ({
  useSearch: () => ({ query: '', onQueryChange: vi.fn(), results: [], isLoading: false, isFetched: true }),
}));

vi.mock('~/core/hooks/use-spaces-query', () => ({ useSpacesQuery: () => ({ data: [], isLoading: false }) }));
vi.mock('~/core/hooks/use-fetch-next-page-on-scroll', () => ({ useFetchNextPageOnScroll: () => ({ ref: vi.fn() }) }));
vi.mock('~/core/hooks/use-toast', () => ({ useToast: () => [null, vi.fn()] }));
vi.mock('~/core/sync/use-mutate', () => ({
  useMutate: () => ({ storage: { entities: { name: { set: vi.fn() } } } }),
}));

beforeEach(() => {
  // Radix popovers measure their content; jsdom ships neither observer.
  window.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;

  // The list scrolls the selected row into view as the arrows move through it.
  Element.prototype.scrollIntoView ??= function scrollIntoView() {};
});

afterEach(cleanup);

const PINNED: SearchResult[] = [
  { id: 'skill-1', name: 'Roadmapping', description: null, types: [], spaces: [] } as unknown as SearchResult,
  { id: 'skill-2', name: 'Forecasting', description: null, types: [], spaces: [] } as unknown as SearchResult,
];

function renderPicker(props: Partial<React.ComponentProps<typeof SelectEntity>> = {}) {
  const onDone = vi.fn();
  render(<SelectEntity spaceId="space-1" onDone={onDone} pinnedResults={PINNED} {...props} />);
  return { onDone };
}

/**
 * The key handlers are bound to the window rather than to the input, so having
 * results is not enough to justify answering a key — the box has to be open.
 *
 * Pinned results made that urgent: they need no query, so a picker nobody has
 * touched still has results, and Enter pressed in a field two rows away was
 * choosing the first recommended skill.
 */
describe('while the search is closed', () => {
  it('does not choose a pinned result on Enter', async () => {
    const { onDone } = renderPicker();

    await userEvent.keyboard('{Enter}');

    expect(onDone).not.toHaveBeenCalled();
  });

  // These call `preventDefault`, so answering them anywhere on the page also
  // stopped the caret moving in whatever the user was really typing in.
  it('leaves the arrow keys to whatever has focus', async () => {
    renderPicker();

    const textarea = document.createElement('textarea');
    textarea.value = 'Some other field';
    document.body.append(textarea);
    textarea.focus();

    try {
      const event = new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true });
      document.dispatchEvent(event);

      expect(event.defaultPrevented).toBe(false);
    } finally {
      // In a `finally`, so a failure here cannot leave a second textbox behind
      // for the next test to trip over.
      textarea.remove();
    }
  });
});

describe('once the search is open', () => {
  it('chooses the selected result on Enter', async () => {
    const { onDone } = renderPicker();

    await userEvent.click(screen.getByRole('textbox'));
    await userEvent.keyboard('{Enter}');

    expect(onDone).toHaveBeenCalledWith(expect.objectContaining({ id: 'skill-1' }));
  });

  it('moves through the results with the arrow keys', async () => {
    const { onDone } = renderPicker();

    await userEvent.click(screen.getByRole('textbox'));
    await userEvent.keyboard('{ArrowDown}');
    await userEvent.keyboard('{Enter}');

    expect(onDone).toHaveBeenCalledWith(expect.objectContaining({ id: 'skill-2' }));
  });
});
