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
  /** The panel the admin asked for. What is open is {@link effectivePanel}: never read this to render. */
  panel: EditorPanel;
  /** The clip the panel is about: the selected clip when it opened (`null` for none). */
  panelFor: string | null;
  /** The popover the admin asked for. What is open is {@link effectivePopover}. */
  popover: EditorPopover | null;
  /** The clip the popover is about: the selected clip when it opened. */
  popoverFor: string | null;
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
  | { type: 'clipsChanged'; keys: readonly string[] }
  /**
   * The editor's facts as they are now: whatever they no longer allow closes for good (it does not
   * come back when they allow it again). Sent whenever they or the view change.
   */
  | { type: 'settle'; facts: EditorFacts };

/** What the editor knows that decides which panel and popover can be open, besides the clips. */
export type EditorFacts = {
  /** This visit's check is the debate's request, so its report has something to show. */
  checkShown: boolean;
  /** Nothing on the reel can be edited (a request in flight, a carried or refused reel, …). */
  readOnly: boolean;
  canPublish: boolean;
  canUnlock: boolean;
};

/** Facts that close nothing: what the reducer assumes between `settle`s. */
export const NO_LIMITS: EditorFacts = { checkShown: true, readOnly: false, canPublish: true, canUnlock: true };

/** The data a view is judged against: the clips now, and the facts. */
export type EditorData = { keys: readonly string[] } & EditorFacts;

export const INITIAL_EDITOR_STATE: EditorState = {
  selection: { kind: 'none' },
  panel: 'transcript',
  panelFor: null,
  popover: null,
  popoverFor: null,
  playback: { mode: 'idle' },
  clipKeys: [],
};

const NONE: EditorSelection = { kind: 'none' };

/** The selected clip's key, or `null` with nothing selected. */
export function selectedKey(state: Pick<EditorState, 'selection'>): string | null {
  return state.selection.kind === 'clip' ? state.selection.key : null;
}

/**
 * What one Esc closes, in this order: a popover, then the side panel, then the selection. Pass the
 * view as it is shown ({@link editorView}), not as it was asked for.
 */
export function escapeTarget(
  state: Pick<EditorState, 'popover' | 'panel' | 'selection'>
): 'popover' | 'panel' | 'selection' | null {
  if (state.popover !== null) return 'popover';
  if (state.panel !== 'transcript') return 'panel';
  if (state.selection.kind === 'clip') return 'selection';
  return null;
}

/**
 * The one rule for which panel is open (GEO-3773). The reducer stores what the admin asked for and
 * what it was about; this says whether that still holds against the data now, so nothing has to
 * close a panel event by event when a clip goes, a request changes or the editor turns read-only.
 *
 * - claim, Replace, Add: about the clip selected when they opened (none, for Add from its card).
 *   They close once the selection is another clip or that clip is gone, and while nothing is editable.
 * - check: its report is about this visit's check, so only while that is the debate's request.
 * - warnings, the transcript: always.
 *
 * `state.selection` must already be resolved against the clips now ({@link resolveSelection}).
 */
export function effectivePanel(
  state: Pick<EditorState, 'panel' | 'panelFor' | 'selection'>,
  facts: EditorFacts
): EditorPanel {
  switch (state.panel) {
    case 'transcript':
    case 'warnings':
      return state.panel;
    case 'check':
      return facts.checkShown ? 'check' : 'transcript';
    case 'claim':
    case 'replace':
      return !facts.readOnly && aboutSelection(state.panelFor, state) && state.panelFor !== null
        ? state.panel
        : 'transcript';
    case 'add':
      return !facts.readOnly && aboutSelection(state.panelFor, state) ? 'add' : 'transcript';
  }
}

/**
 * The same rule for popovers: a clip's claim menu and its advanced options are about the clip
 * selected when they opened; a confirm is open only while what it confirms is allowed.
 */
export function effectivePopover(
  state: Pick<EditorState, 'popover' | 'popoverFor' | 'selection'>,
  facts: EditorFacts
): EditorPopover | null {
  switch (state.popover) {
    case null:
    case 'menu':
      return state.popover;
    case 'publish':
      return facts.canPublish ? 'publish' : null;
    case 'unlock':
      return facts.canUnlock ? 'unlock' : null;
    case 'claimMenu':
    case 'advanced':
      return !facts.readOnly && state.popoverFor !== null && aboutSelection(state.popoverFor, state)
        ? state.popover
        : null;
  }
}

/**
 * The selection is still the clip (or the none) a panel or popover opened for. A clip that went has
 * already handed the selection on ({@link resolveSelection}), so this also covers a clip that went.
 */
function aboutSelection(about: string | null, state: Pick<EditorState, 'selection'>) {
  return selectedKey(state) === about;
}

/**
 * Where the selection is on these clips: a clip still here stays selected; a clip that went hands
 * it to the clip that took its place, or the last, or none. The editor opens on its first clip when
 * a reel turns up where there was none, but not while a reel plays or under the Add picker, where
 * nothing is selected on purpose.
 */
export function resolveSelection(
  state: Pick<EditorState, 'selection' | 'clipKeys' | 'playback' | 'panel'>,
  keys: readonly string[]
): EditorSelection {
  const { selection, clipKeys: previous } = state;
  if (selection.kind === 'none') {
    return previous.length === 0 && keys.length > 0 && state.playback.mode !== 'reel' && state.panel !== 'add'
      ? { kind: 'clip', key: keys[0] }
      : selection;
  }
  if (keys.includes(selection.key)) return selection;
  const at = previous.indexOf(selection.key);
  const fallback = keys[Math.min(Math.max(at, 0), keys.length - 1)];
  return fallback === undefined ? NONE : { kind: 'clip', key: fallback };
}

/** What is shown: the selection on the clips now, and the panel and popover the rule leaves open. */
export function editorView(state: EditorState, data: EditorData): Pick<EditorState, 'selection' | 'panel' | 'popover'> {
  const resolved = { ...state, selection: resolveSelection(state, data.keys) };
  return {
    selection: resolved.selection,
    panel: effectivePanel(resolved, data),
    popover: effectivePopover(resolved, data),
  };
}

/** Commits the rule to the stored view: what it closes stays closed. */
function settled(state: EditorState, facts: EditorFacts): EditorState {
  const panel = effectivePanel(state, facts);
  const popover = effectivePopover(state, facts);
  if (panel === state.panel && popover === state.popover) return state;
  return {
    ...state,
    panel,
    panelFor: panel === state.panel ? state.panelFor : null,
    popover,
    popoverFor: popover === state.popover ? state.popoverFor : null,
  };
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
  // What was open about the clip before closes by the rule (it is about another clip now), except a
  // claim panel on a flagged clip: its claim is what needs fixing, so the panel moves to it.
  const panelFor = base.panel === 'claim' && flagged ? key : base.panelFor;
  return { ...base, selection: { kind: 'clip', key }, panelFor };
}

export function editorReducer(state: EditorState, action: EditorAction): EditorState {
  if (action.type === 'settle') return settled(state, action.facts);
  // Every change is judged by the same rule against the clips the reducer knows; the facts it
  // doesn't know arrive with `settle`.
  return settled(reduce(state, action), NO_LIMITS);
}

function reduce(state: EditorState, action: Exclude<EditorAction, { type: 'settle' }>): EditorState {
  switch (action.type) {
    case 'select':
      return selected(state, action.key, action.flagged === true);
    case 'deselect':
      return { ...stopped(state), selection: NONE };
    case 'openPanel':
      return { ...state, ...panelOpen(state, action.panel), popover: null, popoverFor: null };
    case 'togglePanel':
      return {
        ...state,
        ...(state.panel === action.panel ? PANEL_CLOSED : panelOpen(state, action.panel)),
        popover: null,
        popoverFor: null,
      };
    case 'closePanel':
      return state.panel === 'transcript' ? state : { ...state, ...PANEL_CLOSED };
    case 'startAdd':
      return { ...stopped(state), selection: NONE, panel: 'add', panelFor: null, popover: null, popoverFor: null };
    case 'added':
      return { ...selected(state, action.key, false), ...PANEL_CLOSED };
    case 'openPopover':
      return { ...state, popover: action.popover, popoverFor: selectedKey(state) };
    case 'togglePopover':
      return state.popover === action.popover
        ? { ...state, popover: null, popoverFor: null }
        : { ...state, popover: action.popover, popoverFor: selectedKey(state) };
    case 'closePopover':
      return state.popover === null ? state : { ...state, popover: null, popoverFor: null };
    case 'escape': {
      const target = escapeTarget(state);
      if (target === 'popover') return { ...state, popover: null, popoverFor: null };
      if (target === 'panel') return { ...state, ...PANEL_CLOSED };
      if (target === 'selection') return reduce(state, { type: 'deselect' });
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
        popoverFor: null,
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

const PANEL_CLOSED = { panel: 'transcript', panelFor: null } as const;

/** A panel opened now is about the clip selected now (none for Add from its card). */
function panelOpen(state: EditorState, panel: EditorPanel) {
  return { panel, panelFor: selectedKey(state) };
}

function clipsChanged(state: EditorState, keys: readonly string[]): EditorState {
  let next: EditorState = { ...state, clipKeys: keys };
  // A reel plays the clips it started with: once they change (a refetch after a job, another
  // admin's publish, an edit), it stops, and its selection comes back only if that clip is still here.
  if (next.playback.mode === 'reel' && next.playback.list !== keys.join('|')) next = stopped(next);
  if (next.playback.mode === 'clip' && !keys.includes(next.playback.key)) next = stopped(next);
  // What was open about a clip that went closes by the rule, as on any other change of clip.
  return { ...next, selection: resolveSelection({ ...next, clipKeys: state.clipKeys }, keys) };
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
