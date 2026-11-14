import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';

import { afterEach, describe, expect, it } from 'vitest';

import { DebateVideoTile } from './debate-video-tile';

afterEach(cleanup);

describe('DebateVideoTile', () => {
  it.each([false, true])('keeps turn cues in the existing name chip (Open rounds: %s)', openRounds => {
    const tile = (active: boolean, upNext = false, finishingSince: number | null = null) => (
      <DebateVideoTile
        participantPosition={true}
        participantName="You"
        active={active}
        upNext={upNext}
        inactiveIndicatorId="local"
        openRounds={openRounds}
        finishingSince={finishingSince}
      >
        <div />
      </DebateVideoTile>
    );
    const view = render(tile(false, true));
    const nameChip = screen.getByText('You').parentElement!;
    expect(nameChip).toHaveTextContent('Up next');

    view.rerender(tile(true));
    expect(screen.getByText('You').parentElement).toBe(nameChip);
    expect(nameChip).toHaveTextContent('Your turn');
    expect(screen.queryByText('Up next')).not.toBeInTheDocument();

    view.rerender(tile(false, false, Date.now()));
    expect(screen.getByText('You').parentElement).toBe(nameChip);
    expect(nameChip).toHaveTextContent('Finishing');
    expect(screen.queryByText('Your turn')).not.toBeInTheDocument();
    expect(view.container.querySelector('section')).not.toHaveClass('outline-[3px]');
  });

  it.each([false, true])(
    'never shows a speaker still finishing past the buzzer as muted (GEO-3407, Open rounds: %s)',
    openRounds => {
      const view = render(
        <DebateVideoTile
          participantPosition={null}
          active={false}
          inactive
          inactiveIndicatorId="remote"
          openRounds={openRounds}
        >
          <div />
        </DebateVideoTile>
      );
      const tile = view.container.querySelector('section')!;
      expect(tile.querySelector('[data-muted-indicator]')).toBeInTheDocument();
      expect(tile).not.toHaveAttribute('data-turn-finishing');

      view.rerender(
        <DebateVideoTile
          participantPosition={null}
          active={false}
          inactive
          inactiveIndicatorId="remote"
          openRounds={openRounds}
          finishingSince={Date.now()}
        >
          <div />
        </DebateVideoTile>
      );
      expect(screen.getByRole('img', { name: 'Microphone still open' })).toBeInTheDocument();
      expect(tile.querySelector('[data-muted-indicator]')).not.toBeInTheDocument();
      expect(tile).toHaveAttribute('data-turn-finishing', 'true');
      // The next speaker owns the floor; an open microphone is not a second active turn.
      expect(tile).not.toHaveClass('outline-[3px]');
      expect(tile.querySelector('[data-room-speaker-outline]')).not.toBeInTheDocument();
    }
  );

  it('shows the second speaker finishing over the round transition that forces the muted icon (GEO-3407)', () => {
    const view = render(
      <DebateVideoTile
        participantPosition={null}
        active={false}
        inactiveIndicatorId="remote"
        openRounds
        showMutedIndicator
        finishingSince={Date.now()}
      >
        <div />
      </DebateVideoTile>
    );
    expect(screen.getByRole('img', { name: 'Microphone still open' })).toBeInTheDocument();
    expect(view.container.querySelector('[data-muted-indicator]')).not.toBeInTheDocument();
  });

  it('keeps the active outline and badges in a stacking context of their own, under room overlays', () => {
    const view = render(
      <DebateVideoTile participantPosition={null} active inactiveIndicatorId="remote" openRounds>
        <div />
      </DebateVideoTile>
    );
    expect(view.container.querySelector('section')).toHaveClass('isolate');
    expect(view.container.querySelector('[data-room-speaker-outline]')).toHaveClass('z-50');
  });
});
