import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { CallRemindControl } from './call-remind-control';

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
window.ResizeObserver ??= ResizeObserverStub as unknown as typeof ResizeObserver;

afterEach(cleanup);

const none = { call: false, series: false };

describe('CallRemindControl', () => {
  it('toggles a one-off call on a press', () => {
    const onToggle = vi.fn();
    const { rerender } = render(
      <CallRemindControl reminded={none} hasSeries={false} pending={false} onToggle={onToggle} />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Remind me' }));
    expect(onToggle).toHaveBeenLastCalledWith('call', true);

    rerender(
      <CallRemindControl
        reminded={{ call: true, series: false }}
        hasSeries={false}
        pending={false}
        onToggle={onToggle}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Reminding you' }));
    expect(onToggle).toHaveBeenLastCalledWith('call', false);
  });

  it('offers both reminders for a call in a series', () => {
    const onToggle = vi.fn();
    render(<CallRemindControl reminded={none} hasSeries pending={false} onToggle={onToggle} />);
    fireEvent.click(screen.getByRole('button', { name: 'Remind me' }));
    fireEvent.click(screen.getByRole('button', { name: 'Every call in this series' }));
    expect(onToggle).toHaveBeenLastCalledWith('series', true);
  });

  it('shows each reminder that is set, and clears one alone', () => {
    const onToggle = vi.fn();
    render(<CallRemindControl reminded={{ call: true, series: true }} hasSeries pending={false} onToggle={onToggle} />);
    fireEvent.click(screen.getByRole('button', { name: 'Reminding you · every call' }));
    expect(screen.getByRole('button', { name: /This call/ })).toHaveTextContent('(on)');
    expect(screen.getByRole('button', { name: /Every call in this series/ })).toHaveTextContent('(on)');
    fireEvent.click(screen.getByRole('button', { name: /Every call in this series/ }));
    expect(onToggle).toHaveBeenLastCalledWith('series', false);
  });
});
