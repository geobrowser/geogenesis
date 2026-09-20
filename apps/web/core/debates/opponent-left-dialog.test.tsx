import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen } from '@testing-library/react';

import { describe, expect, it, vi } from 'vitest';

import { OpponentLeftDialog } from './opponent-left-dialog';

vi.mock('~/core/debates/matchmaking/use-focus-trap', () => ({
  useFocusTrap: () => ({ current: null }),
}));

describe('OpponentLeftDialog', () => {
  it('holds until the viewer acknowledges', () => {
    const onAcknowledge = vi.fn();

    render(<OpponentLeftDialog onAcknowledge={onAcknowledge} />);

    expect(screen.getByRole('dialog', { name: 'Opponent left' })).toBeInTheDocument();
    expect(screen.getByText('Your opponent left the debate.')).toBeInTheDocument();
    expect(screen.getByText('Find another match from Debates.')).toBeInTheDocument();
    expect(onAcknowledge).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Find a match' }));

    expect(onAcknowledge).toHaveBeenCalledOnce();
  });

  it('says when a mid-recording capture was discarded', () => {
    render(<OpponentLeftDialog recordingDiscarded onAcknowledge={() => undefined} />);

    expect(screen.getByText('Your opponent left the debate. Your recording was discarded.')).toBeInTheDocument();
  });
});
