import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';

import { afterEach, describe, expect, it } from 'vitest';

import { DebateVideoTile } from './debate-video-tile';

afterEach(cleanup);

describe('DebateVideoTile', () => {
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
      expect(screen.getByRole('img', { name: 'Finishing their sentence' })).toBeInTheDocument();
      expect(tile.querySelector('[data-muted-indicator]')).not.toBeInTheDocument();
      expect(tile).toHaveAttribute('data-turn-finishing', 'true');
      // Still outlined as the one being heard.
      expect(tile.className).toContain('outline-[3px]');
    }
  );
});
