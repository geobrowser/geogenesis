import { cleanup, fireEvent, render, screen } from '@testing-library/react';

import * as React from 'react';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { BestDebateWatchContext } from './best-debate-row';
import { BestDebateWatchProvider } from './best-debate-watch';

const mocks = vi.hoisted(() => ({ capture: vi.fn() }));

vi.mock('~/core/analytics', () => ({ capture: mocks.capture }));
vi.mock('~/core/debates/moments-player/debate-moments-player', () => ({
  DebateMomentsPlayer: ({ debateId }: { debateId: string }) => <p>playing {debateId}</p>,
}));
vi.mock('~/core/debates/moments-player/use-moments-speakers', () => ({ useMomentsSpeakers: () => [] }));
vi.mock('./ranking-flow-dialog', () => ({
  RankingFlowDialog: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

afterEach(() => {
  cleanup();
  mocks.capture.mockClear();
});

function Opener({ entry }: { entry: 'row' | 'poster' }) {
  const watch = React.useContext(BestDebateWatchContext);
  return (
    <button type="button" onClick={() => watch?.('d1', entry)}>
      open
    </button>
  );
}

// A watch is the row's main action on the ranking screen (13 Nov), so each one is counted, with
// where it was opened from.
describe('BestDebateWatchProvider', () => {
  it.each([
    ['row', 'row'],
    ['poster', 'poster'],
  ] as const)('records a watch opened from %s and opens the debate', (entry, recorded) => {
    render(
      <BestDebateWatchProvider source="best_debates_ranking" blockId="block" spaceId="debates">
        <Opener entry={entry} />
      </BestDebateWatchProvider>
    );
    fireEvent.click(screen.getByRole('button', { name: 'open' }));
    expect(mocks.capture).toHaveBeenCalledWith('element_clicked', {
      source: 'best_debates_ranking',
      element_action: 'watch_debate',
      entity_id: 'd1',
      entry: recorded,
      block_id: 'block',
      space_id: 'debates',
    });
    expect(screen.getByText('playing d1')).toBeTruthy();
  });
});
