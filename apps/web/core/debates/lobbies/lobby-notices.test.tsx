import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

import { afterEach, describe, expect, it, vi } from 'vitest';

import type { DebateLobbyMember } from '../api';
import { LobbyNotices } from './lobby-notices';

afterEach(cleanup);

const priya = { display_name: 'Priya' } as DebateLobbyMember;
const base = {
  noticesRef: () => undefined,
  handoff: null,
  queuedOutcome: null,
  onDismissQueuedOutcome: vi.fn(),
  moderationNotice: null,
  guestNotice: null,
  guestConnecting: false,
  onGuestRetry: null,
};

describe('LobbyNotices', () => {
  it('stacks the handoff, a queued request’s outcome and a moderation notice', () => {
    const dismiss = vi.fn();
    render(
      <LobbyNotices
        {...base}
        handoff={priya}
        queuedOutcome="Debate request sent to Sam."
        onDismissQueuedOutcome={dismiss}
        moderationNotice="A host muted you."
      />
    );
    expect(screen.getAllByRole('status').map(toast => toast.textContent)).toEqual([
      'Priya is hosting now',
      'Debate request sent to Sam.OK',
      'A host muted you.',
    ]);
    fireEvent.click(screen.getByRole('button', { name: 'OK' }));
    expect(dismiss).toHaveBeenCalledOnce();
  });

  it('offers a guest’s retry only while it can still apply', () => {
    const retry = vi.fn();
    const notice = { message: 'You’re listening in another tab.', retry: 'Listen here' };
    const { rerender } = render(<LobbyNotices {...base} guestNotice={notice} onGuestRetry={retry} />);
    fireEvent.click(screen.getByRole('button', { name: 'Listen here' }));
    expect(retry).toHaveBeenCalledOnce();

    rerender(<LobbyNotices {...base} guestNotice={notice} onGuestRetry={null} />);
    expect(screen.getByRole('status')).toHaveTextContent('You’re listening in another tab.');
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('says voice is connecting for a guest with no other notice', () => {
    render(<LobbyNotices {...base} guestConnecting />);
    expect(screen.getByRole('status')).toHaveTextContent('Connecting voice…');
  });
});
