/**
 * The moments editor's view state (GEO-3773): which clip is selected, if any; what the side panel
 * shows; which popover or confirm is open; and what is playing. Edits to the reel itself (clips,
 * claims, the base version) stay in the editor; this is only how the admin is looking at it.
 *
 * Pure, so every transition is tested without rendering the editor.
 */

/** No clip selected shows the whole debate ("Full debate"). Keyed, so moving clips keeps it. */
export type EditorSelection = { kind: 'clip'; key: string } | { kind: 'none' };

/** The side panel: the transcript, or one job that returns to it when done or closed. */
export type EditorPanel = 'transcript' | 'replace' | 'add' | 'claim' | 'check' | 'warnings';

/** At most one popover or confirm is open at a time. */
export type EditorPopover = 'menu' | 'advanced' | 'claimMenu' | 'publish' | 'unlock';

/**
 * What the editor is playing. Only the state: the player is driven from it elsewhere.
 *
 * A reel plays the clips it started with, by key (`keys`, in play order, clips with no cut to play
 * left out); `list` is every clip's key at the start, so a change to the reel under it stops it.
 */
export type EditorPlayback =
  | { mode: 'idle' }
  /** Plays until paused. */
  | { mode: 'free' }
  | { mode: 'clip'; key: string }
  | {
      mode: 'reel';
      keys: readonly string[];
      list: string;
      index: number;
      returnTo: EditorSelection;
      loading: boolean;
    };

export type EditorState = {
  selection: EditorSelection;
  panel: EditorPanel;
  popover: EditorPopover | null;
  playback: EditorPlayback;
  /** The reel's clip keys as last seen, in order: where a removed selected clip stood. */
  clipKeys: readonly string[];
};

export type EditorAction =
  /**
   * The admin picked a clip (its card, its place on the timeline, its number in the transcript).
   * `flagged`: the clip has a problem that blocks publishing, whose claim panel stays open.
   */
  | { type: 'select'; key: string; flagged?: boolean }
  /** "Full debate". */
  | { type: 'deselect' }
  | { type: 'openPanel'; panel: Exclude<EditorPanel, 'transcript'> }
  /** Opens the panel, or goes back to the transcript if it is already open. */
  | { type: 'togglePanel'; panel: Exclude<EditorPanel, 'transcript'> }
  /** ✕, a pick in the panel, or anything that finishes the panel's job. */
  | { type: 'closePanel' }
  /** The Add clip card: nothing selected while a clip is picked to add. */
  | { type: 'startAdd' }
  /** A clip was added: it is selected and the picker gives way to the transcript. */
  | { type: 'added'; key: string }
  | { type: 'openPopover'; popover: EditorPopover }
  /** Toggles a popover: a second press on what opened it closes it. */
  | { type: 'togglePopover'; popover: EditorPopover }
  | { type: 'closePopover' }
  /** Esc: one level at a time, see {@link escapeTarget}. */
  | { type: 'escape' }
  /** `keys`: the clips that have a cut to play, in order; `list`: every clip's key. */
  | { type: 'playReel'; keys: readonly string[]; list: readonly string[] }
  | { type: 'playClip'; key: string }
  | { type: 'playFree' }
  /** Pause, Stop, the end of a range, or anything else that stops playback. */
  | { type: 'stop' }
  /** The reel moved on to its next clip (`index`), or was told to jump to one. */
  | { type: 'reelAt'; index: number }
  /** Between two reel clips, while the next one loads. */
  | { type: 'reelLoading'; loading: boolean }
  /** The reel's clips, by key, in order, whenever they change (an edit, a discard, a refetch). */
  | { type: 'clipsChanged'; keys: readonly string[] };

export const INITIAL_EDITOR_STATE: EditorState = {
  selection: { kind: 'none' },
  panel: 'transcript',
  popover: null,
  playback: { mode: 'idle' },
  clipKeys: [],
};

const NONE: EditorSelection = { kind: 'none' };

/** The selected clip's key, or `null` with nothing selected. */
export function selectedKey(state: Pick<EditorState, 'selection'>): string | null {
  return state.selection.kind === 'clip' ? state.selection.key : null;
}

/** What one Esc closes, in this order: a popover, then the side panel, then the selection. */
export function escapeTarget(state: EditorState): 'popover' | 'panel' | 'selection' | null {
  if (state.popover !== null) return 'popover';
  if (state.panel !== 'transcript') return 'panel';
  if (state.selection.kind === 'clip') return 'selection';
  return null;
}

/** Stops whatever plays, putting a reel's selection back as it was before Play reel. */
function stopped(state: EditorState): EditorState {
  if (state.playback.mode === 'idle') return state;
  if (state.playback.mode !== 'reel') return { ...state, playback: { mode: 'idle' } };
  const { returnTo } = state.playback;
  const kept = returnTo.kind === 'clip' && !state.clipKeys.includes(returnTo.key) ? NONE : returnTo;
  return { ...state, selection: kept, playback: { mode: 'idle' } };
}

function selected(state: EditorState, key: string, flagged: boolean): EditorState {
  const base = stopped(state);
  // The claim panel is about one clip: it stays open only for a flagged clip, whose claim is what
  // needs fixing. The picker's job ends with the clip it was replacing or adding.
  const panel =
    (base.panel === 'claim' && !flagged) || base.panel === 'replace' || base.panel === 'add'
      ? 'transcript'
      : base.panel;
  const popover = base.popover === 'claimMenu' || base.popover === 'advanced' ? null : base.popover;
  return { ...base, selection: { kind: 'clip', key }, panel, popover };
}

export function editorReducer(state: EditorState, action: EditorAction): EditorState {
  switch (action.type) {
    case 'select':
      return selected(state, action.key, action.flagged === true);
    case 'deselect': {
      const base = stopped(state);
      return {
        ...base,
        selection: NONE,
        panel: base.panel === 'claim' || base.panel === 'replace' ? 'transcript' : base.panel,
        popover: base.popover === 'claimMenu' || base.popover === 'advanced' ? null : base.popover,
      };
    }
    case 'openPanel':
      return { ...state, panel: action.panel, popover: null };
    case 'togglePanel':
      return { ...state, panel: state.panel === action.panel ? 'transcript' : action.panel, popover: null };
    case 'closePanel':
      return state.panel === 'transcript' ? state : { ...state, panel: 'transcript' };
    case 'startAdd': {
      const base = stopped(state);
      return { ...base, selection: NONE, panel: 'add', popover: null };
    }
    case 'added':
      return { ...selected(state, action.key, false), panel: 'transcript' };
    case 'openPopover':
      return { ...state, popover: action.popover };
    case 'togglePopover':
      return { ...state, popover: state.popover === action.popover ? null : action.popover };
    case 'closePopover':
      return state.popover === null ? state : { ...state, popover: null };
    case 'escape': {
      const target = escapeTarget(state);
      if (target === 'popover') return { ...state, popover: null };
      if (target === 'panel') return { ...state, panel: 'transcript' };
      if (target === 'selection') return editorReducer(state, { type: 'deselect' });
      return state;
    }
    case 'playReel': {
      if (state.playback.mode === 'reel') return stopped(state);
      if (action.keys.length === 0) return stopped(state);
      // A reel started over another playback goes back to the selection, not to what that was.
      const base = stopped(state);
      return {
        ...base,
        popover: null,
        playback: {
          mode: 'reel',
          keys: action.keys,
          list: action.list.join('|'),
          index: 0,
          returnTo: base.selection,
          loading: false,
        },
      };
    }
    case 'playClip':
      return { ...stopped(state), playback: { mode: 'clip', key: action.key } };
    case 'playFree':
      return { ...stopped(state), playback: { mode: 'free' } };
    case 'stop':
      return stopped(state);
    case 'reelAt': {
      if (state.playback.mode !== 'reel') return state;
      // Past the last clip, the reel is over.
      if (action.index >= state.playback.keys.length) return stopped(state);
      return { ...state, playback: { ...state.playback, index: Math.max(0, action.index), loading: false } };
    }
    case 'reelLoading':
      return state.playback.mode === 'reel' && state.playback.loading !== action.loading
        ? { ...state, playback: { ...state.playback, loading: action.loading } }
        : state;
    case 'clipsChanged':
      return clipsChanged(state, action.keys);
  }
}

function clipsChanged(state: EditorState, keys: readonly string[]): EditorState {
  const previous = state.clipKeys;
  let next: EditorState = { ...state, clipKeys: keys };
  // A reel plays the clips it started with: once they change (a refetch after a job, another
  // admin's publish, an edit), it stops, and its selection comes back only if that clip is still here.
  if (next.playback.mode === 'reel' && next.playback.list !== keys.join('|')) next = stopped(next);
  if (next.playback.mode === 'clip' && !keys.includes(next.playback.key)) next = stopped(next);

  const { selection } = next;
  if (selection.kind === 'none') {
    // The editor opens on its first clip, as it does when a reel turns up where there was none; not
    // under the Add picker, where nothing is selected on purpose.
    return previous.length === 0 && keys.length > 0 && next.playback.mode !== 'reel' && next.panel !== 'add'
      ? { ...next, selection: { kind: 'clip', key: keys[0] } }
      : next;
  }
  if (keys.includes(selection.key)) return next;
  // The selected clip went: the clip that took its place is selected, or the last one, or none. What
  // was open about the clip that went closes, as on any change of clip: a claim panel, a Replace
  // picker or a clip popover would otherwise act on a clip the admin never chose.
  const at = previous.indexOf(selection.key);
  const fallback = keys[Math.min(Math.max(at, 0), keys.length - 1)];
  return {
    ...next,
    selection: fallback === undefined ? NONE : { kind: 'clip', key: fallback },
    panel: next.panel === 'claim' || next.panel === 'replace' ? 'transcript' : next.panel,
    popover: next.popover === 'claimMenu' || next.popover === 'advanced' ? null : next.popover,
  };
}

/**
 * The clips a reel plays, in order: those with a cut to play. A clip with none (`null`) is already
 * flagged and can't be published, so the reel skips it rather than stopping on it. A carried reel
 * has no cuts on this video at all, so it plays every clip's own span (the times are approximate).
 */
export function reelKeys(keys: readonly string[], played: readonly unknown[], carried: boolean): string[] {
  if (carried) return [...keys];
  return keys.filter((_, at) => played[at] !== null && played[at] !== undefined);
}
