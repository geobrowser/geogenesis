import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';

import { afterEach, describe, expect, it } from 'vitest';

import { DebateTurnNotice } from './debate-turn-notice';

afterEach(cleanup);

describe('DebateTurnNotice', () => {
  it('keeps one announcement region through count-ins, speaking turns and round breaks without announcing ticks', () => {
    const view = render(<DebateTurnNotice speaker={null} nextSpeaker={null} />);
    const announcement = screen.getByRole('status');
    expect(announcement).toBeEmptyDOMElement();

    view.rerender(<DebateTurnNotice speaker={null} nextSpeaker={{ name: 'You', local: true, seconds: 5 }} />);
    expect(screen.getByRole('status')).toBe(announcement);
    expect(announcement).toHaveTextContent('You’re next');
    expect(announcement).not.toHaveTextContent('5');
    expect(screen.getByText('· Starts in 5s')).toBeInTheDocument();
    const countInAnnouncement = announcement.textContent;

    view.rerender(<DebateTurnNotice speaker={null} nextSpeaker={{ name: 'You', local: true, seconds: 4 }} />);
    expect(announcement.textContent).toBe(countInAnnouncement);
    expect(screen.getByText('· Starts in 4s')).toBeInTheDocument();

    view.rerender(<DebateTurnNotice speaker={{ name: 'You', local: true }} nextSpeaker={null} />);
    expect(screen.getByRole('status')).toBe(announcement);
    expect(announcement).toHaveTextContent('Your turn');
    expect(announcement).toHaveTextContent('Speak now');
    expect(announcement).not.toHaveTextContent('next');

    view.rerender(<DebateTurnNotice speaker={null} nextSpeaker={null} />);
    expect(screen.getByRole('status')).toBe(announcement);
    expect(announcement).toBeEmptyDOMElement();
    expect(view.container.querySelector('[data-debate-turn-notice]')).not.toBeInTheDocument();
  });

  it.each([
    { microphoneMuted: true, reconnecting: false, instruction: 'Your microphone is off.' },
    { microphoneMuted: false, reconnecting: true, instruction: 'Reconnecting — the debate clock is still running.' },
  ])('keeps turn ownership visible while $instruction', ({ instruction, ...audioState }) => {
    render(<DebateTurnNotice speaker={{ name: 'You', local: true }} nextSpeaker={null} {...audioState} />);
    expect(screen.getByRole('status')).toHaveTextContent('Your turn');
    expect(screen.getByRole('status')).toHaveTextContent(instruction);
    expect(screen.getByRole('status')).not.toHaveTextContent('Speak now');
  });
});
