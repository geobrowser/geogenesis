import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';

import { afterEach, describe, expect, it } from 'vitest';

import { DebateTurnAnnouncement } from './debate-turn-announcement';

afterEach(cleanup);

describe('DebateTurnAnnouncement', () => {
  it('keeps one announcement region through count-ins, speaking turns and round breaks without announcing ticks', () => {
    const view = render(<DebateTurnAnnouncement speaker={null} nextSpeaker={null} />);
    const announcement = screen.getByRole('status');
    expect(announcement).toBeEmptyDOMElement();

    view.rerender(<DebateTurnAnnouncement speaker={null} nextSpeaker={{ name: 'You', local: true, seconds: 5 }} />);
    expect(screen.getByRole('status')).toBe(announcement);
    expect(announcement).toHaveTextContent('You’re next');
    expect(announcement).not.toHaveTextContent('5');
    const countInAnnouncement = announcement.textContent;

    view.rerender(<DebateTurnAnnouncement speaker={null} nextSpeaker={{ name: 'You', local: true, seconds: 4 }} />);
    expect(announcement.textContent).toBe(countInAnnouncement);

    view.rerender(<DebateTurnAnnouncement speaker={{ name: 'You', local: true }} nextSpeaker={null} />);
    expect(screen.getByRole('status')).toBe(announcement);
    expect(announcement).toHaveTextContent('Your turn');
    expect(announcement).toHaveTextContent('Speak now');
    expect(announcement).not.toHaveTextContent('next');

    view.rerender(<DebateTurnAnnouncement speaker={null} nextSpeaker={null} />);
    expect(screen.getByRole('status')).toBe(announcement);
    expect(announcement).toBeEmptyDOMElement();
    expect(view.container.children).toHaveLength(1);
    expect(announcement).toHaveClass('sr-only');
  });

  it.each([
    { microphoneMuted: true, connectionState: 'connected' as const, instruction: 'Your microphone is off.' },
    { microphoneMuted: false, connectionState: 'connecting' as const, instruction: 'Connecting to call audio…' },
    {
      microphoneMuted: false,
      connectionState: 'reconnecting' as const,
      instruction: 'Reconnecting — the debate clock is still running.',
    },
  ])('announces turn ownership while $instruction', ({ instruction, ...audioState }) => {
    render(<DebateTurnAnnouncement speaker={{ name: 'You', local: true }} nextSpeaker={null} {...audioState} />);
    expect(screen.getByRole('status')).toHaveTextContent('Your turn');
    expect(screen.getByRole('status')).toHaveTextContent(instruction);
    expect(screen.getByRole('status')).not.toHaveTextContent('Speak now');
  });
});
