import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { ClampedText } from './clamped-text';

/**
 * jsdom lays nothing out, so the component measures every element as 0×0 and
 * decides nothing overflows — the toggle would never render, and every test here
 * would pass by testing an empty page.
 *
 * `isEllipsisActive` falls back to comparing scroll and client height when it
 * gets a zero-sized rect, which is the one measurement jsdom can be told to
 * fake. Overflowing for the whole file, since that is the only state with a
 * toggle in it.
 */
beforeEach(() => {
  Object.defineProperty(HTMLElement.prototype, 'scrollHeight', { configurable: true, value: 500 });
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', { configurable: true, value: 20 });
});

afterEach(() => {
  cleanup();
  Reflect.deleteProperty(HTMLElement.prototype, 'scrollHeight');
  Reflect.deleteProperty(HTMLElement.prototype, 'clientHeight');
});

const LONG = 'Long enough that it has to be clamped. '.repeat(10);

describe('the toggle', () => {
  it('appears once the text overflows', () => {
    render(<ClampedText text={LONG} />);

    expect(screen.getByRole('button', { name: 'More' })).toBeInTheDocument();
  });

  it('is named only More without a label, as every caller had it', () => {
    render(<ClampedText text={LONG} />);

    expect(screen.getByRole('button', { name: 'More' })).toHaveAttribute('aria-expanded', 'false');
  });

  // Several of these on one page are otherwise a list of identical buttons with
  // nothing to say which opens what.
  it('says what it expands when given a label', () => {
    render(<ClampedText text={LONG} label="description for Engineer" />);

    expect(screen.getByRole('button', { name: 'Show more description for Engineer' })).toBeInTheDocument();
  });

  it('keeps saying it once expanded', async () => {
    render(<ClampedText text={LONG} label="skills for Engineer" />);

    await userEvent.click(screen.getByRole('button', { name: 'Show more skills for Engineer' }));

    expect(screen.getByRole('button', { name: 'Show less skills for Engineer' })).toHaveAttribute(
      'aria-expanded',
      'true'
    );
  });

  // Two toggles on one row — the description and the skills — need telling apart
  // as much as two rows do.
  it('tells two toggles in one place apart', () => {
    render(
      <>
        <ClampedText text={LONG} label="description for Engineer" />
        <ClampedText text={LONG} label="skills for Engineer" />
      </>
    );

    const names = screen.getAllByRole('button').map(button => button.getAttribute('aria-label'));
    expect(new Set(names).size).toBe(names.length);
  });
});
