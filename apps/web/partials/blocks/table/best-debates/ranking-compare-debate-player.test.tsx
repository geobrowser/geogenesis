import { cleanup, fireEvent, render, screen } from '@testing-library/react';

import * as React from 'react';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { RANKING_COMPARE_PLAYBACK_GROUP, RankingCompareDebatePlayer } from './ranking-compare-debate-player';

const mocks = vi.hoisted(() => ({ props: [] as Array<Record<string, unknown>> }));

// The moments player itself is covered by its own tests; here only what the compare view hands it.
vi.mock('~/core/debates/moments-player/debate-moments-player', () => ({
  DebateMomentsPlayer: (props: Record<string, unknown> & { label: string; onPlay?: () => void }) => {
    mocks.props.push(props);
    return (
      <button type="button" onClick={props.onPlay}>
        play {props.label}
      </button>
    );
  },
}));

afterEach(() => {
  cleanup();
  mocks.props.length = 0;
});

describe('RankingCompareDebatePlayer', () => {
  it('plays both sides through the moments player in one playback group, so only one plays', () => {
    render(
      <>
        <RankingCompareDebatePlayer debateEntityId="aaaa" label="New" active={false} onActivate={vi.fn()} />
        <RankingCompareDebatePlayer debateEntityId="bbbb" label="Existing" active={false} onActivate={vi.fn()} />
      </>
    );

    expect(mocks.props.map(p => [p.debateId, p.playbackGroup])).toEqual([
      ['aaaa', RANKING_COMPARE_PLAYBACK_GROUP],
      ['bbbb', RANKING_COMPARE_PLAYBACK_GROUP],
    ]);
    // No moments list is passed: the player reads the reel, and opens the full debate without one.
    expect(mocks.props.every(p => p.moments === undefined)).toBe(true);
  });

  it('tells the dialog which side the viewer started', () => {
    const onActivate = vi.fn();
    render(<RankingCompareDebatePlayer debateEntityId="aaaa" label="New" active={false} onActivate={onActivate} />);
    fireEvent.click(screen.getByText('play New'));
    expect(onActivate).toHaveBeenCalled();
  });
});
