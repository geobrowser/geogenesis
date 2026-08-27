import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

import type React from 'react';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { ResultContent } from './results-list';

/**
 * GEO-2701. A search result goes somewhere, so it has to be something the browser can act on.
 * Rendered as a button it had no destination: cmd-click opened nothing, middle click did nothing,
 * and right click offered no "Open in new tab" — the interactions people use to fan a knowledge
 * graph out across tabs.
 *
 * The same component is the picker's row, where clicking chooses a value rather than travelling to
 * one. That row has nowhere to go, so it stays a button; the difference is whether a caller passes
 * an `href`.
 */
vi.mock('~/design-system/geo-image', () => ({ GeoImage: () => null }));
vi.mock('~/design-system/native-geo-image', () => ({ NativeGeoImage: () => null }));

afterEach(cleanup);

const RESULT = {
  id: 'entity-1',
  name: 'Ethereum',
  description: null,
  types: [],
  spaces: [{ spaceId: 'space-1', name: 'Crypto', image: null }],
} as never;

const HREF = '/space/space-1/entity-1';

function renderRow(props: Partial<React.ComponentProps<typeof ResultContent>> = {}) {
  const onClick = vi.fn();
  render(<ResultContent onClick={onClick} result={RESULT} {...props} />);
  return { onClick };
}

describe('ResultContent', () => {
  describe('as a link', () => {
    it('is an anchor carrying where it goes', () => {
      renderRow({ href: HREF });

      expect(screen.getByRole('link', { name: /Ethereum/ })).toHaveAttribute('href', HREF);
    });

    // The browser was asked for a new tab. Following the href *and* running the row's own handler
    // would open the result twice: once beside the current page and once in place of it.
    it.each([
      ['cmd', { metaKey: true }],
      ['ctrl', { ctrlKey: true }],
      ['shift', { shiftKey: true }],
      ['middle click', { button: 1 }],
    ])('leaves a %s click to the browser', (_name, modifier) => {
      const { onClick } = renderRow({ href: HREF });

      const event = fireEvent.click(screen.getByRole('link', { name: /Ethereum/ }), modifier);

      // Not prevented: the browser still gets to open its new tab.
      expect(event).toBe(true);
      expect(onClick).not.toHaveBeenCalled();
    });

    // An ordinary click belongs to whoever already handled selection — cmdk, in the search dialog.
    // Letting the href go too would navigate twice.
    it('hands an ordinary click to the row’s own handler', () => {
      const { onClick } = renderRow({ href: HREF });

      const event = fireEvent.click(screen.getByRole('link', { name: /Ethereum/ }));

      expect(event).toBe(false);
      expect(onClick).toHaveBeenCalledTimes(1);
    });
  });

  describe('as a picker row', () => {
    // Nothing to navigate to, so nothing to make a link of.
    it('stays a button when it has nowhere to go', () => {
      renderRow();

      expect(screen.queryByRole('link')).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Ethereum/ })).toBeInTheDocument();
    });

    it('still selects on click', () => {
      const { onClick } = renderRow();

      fireEvent.click(screen.getByRole('button', { name: /Ethereum/ }));

      expect(onClick).toHaveBeenCalledTimes(1);
    });
  });
});
