/**
 * The moments player's state machine (GEO-3687), pure so its stepping is tested on its own.
 *
 * Two modes. `moments` plays the reel one clip at a time, as a story card. `full` plays the whole
 * debate. A debate with no moments only ever has `full`, and nothing to close back to.
 */
export type PlayerMode = 'moments' | 'full';

export type StoryState = {
  mode: PlayerMode;
  /** How many moments the reel has. 0 for a debate without one. */
  count: number;
  /** The moment on screen, 0-based. Kept while in `full`, so closing returns to it. */
  index: number;
  /** The last moment played to its end; the next play starts the reel over. */
  finished: boolean;
  /**
   * Where the full debate should start when it is next opened, on its own clock. Set by `expand`
   * (the moment the viewer was on) and by a moment dot; null starts it from the top.
   */
  fullStartMs: number | null;
  /** Bumped by every request to seek the full debate, so the same time asked twice still seeks. */
  seekRequest: number;
};

export type StoryAction =
  | { type: 'next' }
  | { type: 'previous' }
  | { type: 'clipEnded' }
  | { type: 'restart' }
  /** Play moment `index` (a transcript line pressed, GEO-3728), from the full debate too. */
  | { type: 'goTo'; index: number }
  | { type: 'expand'; atMs: number | null }
  | { type: 'collapse' }
  | { type: 'seekFull'; atMs: number; index?: number };

/** Moments first when there are any; the full debate straight away when there are none. */
export function initialStoryState(count: number): StoryState {
  return {
    mode: count > 0 ? 'moments' : 'full',
    count,
    index: 0,
    finished: false,
    fullStartMs: null,
    seekRequest: 0,
  };
}

export function storyReducer(state: StoryState, action: StoryAction): StoryState {
  switch (action.type) {
    case 'next':
      // A tap past the last moment stays on it, like a story's last card.
      return state.index < state.count - 1 ? { ...state, index: state.index + 1, finished: false } : state;
    case 'previous':
      return { ...state, index: Math.max(0, state.index - 1), finished: false };
    case 'clipEnded':
      return state.index < state.count - 1
        ? { ...state, index: state.index + 1, finished: false }
        : { ...state, finished: true };
    case 'restart':
      return { ...state, index: 0, finished: false };
    case 'goTo':
      if (!Number.isInteger(action.index) || action.index < 0 || action.index >= state.count) return state;
      return { ...state, mode: 'moments', index: action.index, finished: false };
    case 'expand':
      return {
        ...state,
        mode: 'full',
        fullStartMs: action.atMs,
        seekRequest: state.seekRequest + 1,
      };
    case 'collapse':
      return state.count > 0 ? { ...state, mode: 'moments', finished: false } : state;
    case 'seekFull':
      return {
        ...state,
        index: action.index ?? state.index,
        fullStartMs: action.atMs,
        seekRequest: state.seekRequest + 1,
      };
  }
}
