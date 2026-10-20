import '@testing-library/jest-dom/vitest';
import { act, cleanup, render, screen } from '@testing-library/react';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { ROOM_EXIT_MS, RoomDim, RoomExit } from './debate-room-stamps';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('RoomExit (GEO-3315)', () => {
  it('keeps a moment up while it leaves, then lets it go', () => {
    vi.useFakeTimers();
    const view = render(<RoomExit>{<span>Round 2</span>}</RoomExit>);
    const moment = screen.getByText('Round 2');
    expect(moment.parentElement).not.toHaveAttribute('data-room-leaving');

    view.rerender(<RoomExit>{null}</RoomExit>);
    // The same element, not a fresh one, so its entrance does not replay on the way out.
    expect(screen.getByText('Round 2')).toBe(moment);
    expect(moment.parentElement).toHaveAttribute('data-room-leaving', 'true');
    expect(moment.parentElement).toHaveClass('animate-[fadeIn_300ms_linear_reverse_both]');

    act(() => {
      vi.advanceTimersByTime(ROOM_EXIT_MS);
    });
    expect(screen.queryByText('Round 2')).not.toBeInTheDocument();
  });

  it('takes no input and hides from assistive technology on its way out, so a late tap cannot pick', () => {
    vi.useFakeTimers();
    const view = render(
      <RoomExit>
        <button type="button">Extend</button>
      </RoomExit>
    );
    const wrapper = screen.getByRole('button', { name: 'Extend' }).parentElement;
    expect(wrapper).not.toHaveAttribute('inert');
    expect(wrapper).not.toHaveAttribute('aria-hidden');

    view.rerender(<RoomExit>{null}</RoomExit>);
    expect(wrapper).toHaveAttribute('inert');
    expect(wrapper).toHaveAttribute('aria-hidden', 'true');
    expect(screen.queryByRole('button', { name: 'Extend' })).not.toBeInTheDocument();
  });

  it('brings a moment straight back if it returns while leaving', () => {
    vi.useFakeTimers();
    const view = render(<RoomExit>{<span>Go!</span>}</RoomExit>);
    view.rerender(<RoomExit>{false}</RoomExit>);
    view.rerender(<RoomExit>{<span>Go!</span>}</RoomExit>);

    expect(screen.getByText('Go!').parentElement).not.toHaveAttribute('data-room-leaving');
    act(() => {
      vi.advanceTimersByTime(ROOM_EXIT_MS);
    });
    expect(screen.getByText('Go!')).toBeInTheDocument();
  });

  it('renders nothing when there is nothing to show', () => {
    const { container } = render(<RoomExit>{null}</RoomExit>);
    expect(container).toBeEmptyDOMElement();
  });
});

describe('RoomDim', () => {
  it('fades rather than mounting, so moments hand over without a flash', () => {
    const view = render(<RoomDim on={false} />);
    const dim = view.container.querySelector('[data-room-dim]');
    expect(dim).toHaveClass('opacity-0', 'transition-opacity');

    view.rerender(<RoomDim on />);
    expect(view.container.querySelector('[data-room-dim]')).toBe(dim);
    expect(dim).toHaveClass('opacity-100');
  });
});
