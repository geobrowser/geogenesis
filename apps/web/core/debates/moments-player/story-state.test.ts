import { describe, expect, it } from 'vitest';

import { type StoryAction, initialStoryState, storyReducer } from './story-state';

const run = (count: number, ...actions: StoryAction[]) => actions.reduce(storyReducer, initialStoryState(count));

describe('story state', () => {
  it('opens on the first moment, or straight in the full debate when there are none', () => {
    expect(initialStoryState(4)).toMatchObject({ mode: 'moments', index: 0 });
    expect(initialStoryState(0)).toMatchObject({ mode: 'full', count: 0 });
  });

  it('steps on and back, holding at both ends', () => {
    expect(run(4, { type: 'next' }, { type: 'next' }).index).toBe(2);
    expect(run(4, { type: 'next' }, { type: 'previous' }, { type: 'previous' }).index).toBe(0);
    expect(run(2, { type: 'next' }, { type: 'next' }, { type: 'next' }).index).toBe(1);
  });

  it('plays the reel through, then finishes on the last moment and restarts from the first', () => {
    const ended = run(3, { type: 'clipEnded' }, { type: 'clipEnded' });
    expect(ended).toMatchObject({ index: 2, finished: false });
    const finished = storyReducer(ended, { type: 'clipEnded' });
    expect(finished).toMatchObject({ index: 2, finished: true });
    expect(storyReducer(finished, { type: 'restart' })).toMatchObject({ index: 0, finished: false });
  });

  it('expands to the full debate at a time and closes back to the same moment', () => {
    const full = run(4, { type: 'next' }, { type: 'expand', atMs: 84_330 });
    expect(full).toMatchObject({ mode: 'full', index: 1, fullStartMs: 84_330 });
    const dot = storyReducer(full, { type: 'seekFull', atMs: 150_290, index: 2 });
    expect(dot).toMatchObject({ mode: 'full', index: 2, fullStartMs: 150_290 });
    expect(dot.seekRequest).toBeGreaterThan(full.seekRequest);
    expect(storyReducer(dot, { type: 'collapse' })).toMatchObject({ mode: 'moments', index: 2 });
  });

  it('has nothing to close back to without moments', () => {
    const state = initialStoryState(0);
    expect(storyReducer(state, { type: 'collapse' })).toBe(state);
  });

  // GEO-3728: a transcript line plays its moment, whatever the player was showing.
  it('goes to a moment from the reel, from the full debate and from a finished reel', () => {
    expect(run(4, { type: 'goTo', index: 2 })).toMatchObject({ mode: 'moments', index: 2, finished: false });
    expect(run(4, { type: 'expand', atMs: 1_000 }, { type: 'goTo', index: 3 })).toMatchObject({
      mode: 'moments',
      index: 3,
    });
    const finished = run(2, { type: 'clipEnded' }, { type: 'clipEnded' });
    expect(finished.finished).toBe(true);
    expect(storyReducer(finished, { type: 'goTo', index: 1 })).toMatchObject({ index: 1, finished: false });
  });

  it('ignores a moment the reel does not have', () => {
    const state = initialStoryState(3);
    expect(storyReducer(state, { type: 'goTo', index: 3 })).toBe(state);
    expect(storyReducer(state, { type: 'goTo', index: -1 })).toBe(state);
    const none = initialStoryState(0);
    expect(storyReducer(none, { type: 'goTo', index: 0 })).toBe(none);
  });
});
