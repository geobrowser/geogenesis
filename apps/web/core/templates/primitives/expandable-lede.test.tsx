import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { ExpandableLede } from './expandable-lede';

function mockHeights(scrollHeight: number, clientHeight: number) {
  vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockReturnValue(scrollHeight);
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(clientHeight);
}

describe('ExpandableLede', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('clamps a long description to four lines and toggles Show more / Show less', () => {
    mockHeights(250, 100);
    render(<ExpandableLede text="A long description." />);

    const text = screen.getByTestId('expandable-lede');
    expect(text).toHaveClass('line-clamp-4');

    fireEvent.click(screen.getByRole('button', { name: 'Show more' }));
    expect(text).not.toHaveClass('line-clamp-4');
    expect(screen.getByRole('button', { name: 'Show less' })).toHaveAttribute('aria-expanded', 'true');

    fireEvent.click(screen.getByRole('button', { name: 'Show less' }));
    expect(text).toHaveClass('line-clamp-4');
  });

  it('draws no toggle when the description fits', () => {
    mockHeights(75, 75);
    render(<ExpandableLede text="Short." />);

    expect(screen.queryByRole('button', { name: 'Show more' })).toBeNull();
  });
});
