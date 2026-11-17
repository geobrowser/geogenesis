import { describe, expect, it } from 'vitest';

import {
  type EditorAction,
  type EditorData,
  type EditorPanel,
  type EditorPopover,
  type EditorState,
  INITIAL_EDITOR_STATE,
  NO_LIMITS,
  editorReducer,
  editorView,
  escapeTarget,
  reelKeys,
  selectedKey,
} from './editor-state';

const run = (actions: EditorAction[], from: EditorState = INITIAL_EDITOR_STATE) => actions.reduce(editorReducer, from);
const loaded = (keys = ['a', 'b', 'c']) => run([{ type: 'clipsChanged', keys }]);

describe('editorReducer (GEO-3773)', () => {
  it('opens on the first clip once the reel loads, and on none for a reel with no clips', () => {
    expect(selectedKey(loaded())).toBe('a');
    expect(selectedKey(loaded([]))).toBeNull();
  });

  it('selects a clip by key and deselects to the full debate', () => {
    const state = run([{ type: 'select', key: 'b' }], loaded());
    expect(state.selection).toEqual({ kind: 'clip', key: 'b' });
    expect(run([{ type: 'deselect' }], state).selection).toEqual({ kind: 'none' });
  });

  it('keeps nothing selected when the reel changes after a deselect', () => {
    const state = run([{ type: 'deselect' }, { type: 'clipsChanged', keys: ['a', 'c'] }], loaded());
    expect(selectedKey(state)).toBeNull();
  });

  it('hands the selection to the clip that took a removed clip’s place, or the last, or none', () => {
    const middle = run(
      [
        { type: 'select', key: 'b' },
        { type: 'clipsChanged', keys: ['a', 'c'] },
      ],
      loaded()
    );
    expect(selectedKey(middle)).toBe('c');
    const last = run(
      [
        { type: 'select', key: 'c' },
        { type: 'clipsChanged', keys: ['a', 'b'] },
      ],
      loaded()
    );
    expect(selectedKey(last)).toBe('b');
    const gone = run([{ type: 'clipsChanged', keys: [] }], loaded());
    expect(selectedKey(gone)).toBeNull();
  });

  it.each(['claim', 'replace'] as const)(
    'closes the %s panel when the selected clip goes from under it, and keeps it when another clip goes',
    panel => {
      const open = run(
        [
          { type: 'select', key: 'b', flagged: true },
          { type: 'openPanel', panel },
        ],
        loaded()
      );
      const fellBack = run([{ type: 'clipsChanged', keys: ['a', 'c'] }], open);
      expect(selectedKey(fellBack)).toBe('c');
      expect(fellBack.panel).toBe('transcript');
      expect(run([{ type: 'clipsChanged', keys: [] }], open).panel).toBe('transcript');
      expect(run([{ type: 'clipsChanged', keys: ['b', 'c'] }], open).panel).toBe(panel);
    }
  );

  it('closes a clip popover when the selected clip goes, and keeps the publish confirm', () => {
    const menu = run(
      [
        { type: 'select', key: 'b' },
        { type: 'openPopover', popover: 'claimMenu' },
      ],
      loaded()
    );
    expect(run([{ type: 'clipsChanged', keys: ['a', 'c'] }], menu).popover).toBeNull();
    const confirm = run([{ type: 'openPopover', popover: 'publish' }], menu);
    expect(run([{ type: 'clipsChanged', keys: ['a', 'c'] }], confirm).popover).toBe('publish');
  });

  it('selects nothing under the Add picker when a reel turns up where there was none', () => {
    const adding = run([{ type: 'startAdd' }], loaded([]));
    const state = run([{ type: 'clipsChanged', keys: ['a', 'b'] }], adding);
    expect(selectedKey(state)).toBeNull();
    expect(state.panel).toBe('add');
  });

  it('keeps the selected clip when another clip is removed or the clips are reordered', () => {
    const state = run(
      [
        { type: 'select', key: 'c' },
        { type: 'clipsChanged', keys: ['c', 'b'] },
      ],
      loaded()
    );
    expect(selectedKey(state)).toBe('c');
  });

  it.each(['replace', 'add', 'check', 'warnings', 'claim'] as const)(
    'closes the %s panel back to the transcript',
    panel => {
      const open = run([{ type: 'openPanel', panel }], loaded());
      expect(open.panel).toBe(panel);
      expect(run([{ type: 'closePanel' }], open).panel).toBe('transcript');
    }
  );

  it('toggles Replace: a second press goes back to the transcript', () => {
    const once = run([{ type: 'togglePanel', panel: 'replace' }], loaded());
    expect(once.panel).toBe('replace');
    expect(run([{ type: 'togglePanel', panel: 'replace' }], once).panel).toBe('transcript');
  });

  it('closes the picker and a healthy clip’s claim panel on a new selection, keeping check and warnings', () => {
    for (const panel of ['replace', 'add', 'claim'] as const) {
      expect(
        run(
          [
            { type: 'openPanel', panel },
            { type: 'select', key: 'b' },
          ],
          loaded()
        ).panel
      ).toBe('transcript');
    }
    for (const panel of ['check', 'warnings'] as const) {
      expect(
        run(
          [
            { type: 'openPanel', panel },
            { type: 'select', key: 'b' },
          ],
          loaded()
        ).panel
      ).toBe(panel);
    }
    expect(
      run(
        [
          { type: 'openPanel', panel: 'claim' },
          { type: 'select', key: 'b', flagged: true },
        ],
        loaded()
      ).panel
    ).toBe('claim');
  });

  it('closes a clip’s own popovers on a new selection, but not a confirm', () => {
    for (const popover of ['claimMenu', 'advanced'] as const) {
      expect(
        run(
          [
            { type: 'openPopover', popover },
            { type: 'select', key: 'b' },
          ],
          loaded()
        ).popover
      ).toBeNull();
    }
    expect(
      run(
        [
          { type: 'openPopover', popover: 'publish' },
          { type: 'select', key: 'b' },
        ],
        loaded()
      ).popover
    ).toBe('publish');
  });

  it('ends the clip’s own jobs when the selected clip is picked again, keeping a flagged clip’s claim panel', () => {
    const at = loaded();
    const selectedNow = selectedKey(at) ?? '';
    for (const panel of ['replace', 'claim'] as const) {
      expect(
        run(
          [
            { type: 'openPanel', panel },
            { type: 'select', key: selectedNow },
          ],
          at
        ).panel
      ).toBe('transcript');
    }
    for (const popover of ['claimMenu', 'advanced'] as const) {
      expect(
        run(
          [
            { type: 'openPopover', popover },
            { type: 'select', key: selectedNow },
          ],
          at
        ).popover
      ).toBeNull();
    }
    const flagged = run(
      [
        { type: 'openPanel', panel: 'claim' },
        { type: 'select', key: selectedNow, flagged: true },
      ],
      at
    );
    expect([flagged.panel, flagged.panelFor]).toEqual(['claim', selectedNow]);
  });

  it('adds through the picker: nothing selected while picking, then the new clip, back on the transcript', () => {
    const picking = run([{ type: 'startAdd' }], loaded());
    expect(picking).toMatchObject({ selection: { kind: 'none' }, panel: 'add' });
    const added = run(
      [
        { type: 'added', key: 'd' },
        { type: 'clipsChanged', keys: ['a', 'b', 'c', 'd'] },
      ],
      picking
    );
    expect(added).toMatchObject({ selection: { kind: 'clip', key: 'd' }, panel: 'transcript' });
  });

  it('ends playback and the selected clip’s own jobs on a discard, even when the clip is still there', () => {
    const at = run([{ type: 'select', key: 'b' }], loaded());
    for (const panel of ['replace', 'claim'] as const) {
      const after = run(
        [
          { type: 'openPanel', panel },
          { type: 'discarded', keys: ['a', 'b', 'c'] },
          { type: 'clipsChanged', keys: ['a', 'b', 'c'] },
        ],
        at
      );
      expect(after).toMatchObject({ panel: 'transcript', selection: { kind: 'clip', key: 'b' } });
    }
    for (const popover of ['claimMenu', 'advanced'] as const) {
      expect(
        run(
          [
            { type: 'openPopover', popover },
            { type: 'discarded', keys: ['a', 'b', 'c'] },
          ],
          at
        ).popover
      ).toBeNull();
    }
    expect(
      run(
        [
          { type: 'playClip', key: 'b' },
          { type: 'discarded', keys: ['a', 'b', 'c'] },
        ],
        at
      ).playback
    ).toEqual({ mode: 'idle' });
    // What isn't about a clip stays: the warnings panel and the header menu.
    expect(
      run(
        [
          { type: 'openPanel', panel: 'warnings' },
          { type: 'discarded', keys: ['a', 'b', 'c'] },
        ],
        at
      ).panel
    ).toBe('warnings');
    expect(
      run(
        [
          { type: 'openPopover', popover: 'menu' },
          { type: 'discarded', keys: ['a', 'b', 'c'] },
        ],
        at
      ).popover
    ).toBe('menu');
  });

  it('hands a discarded clip’s selection to the clip in its place, or the first when that is past the end', () => {
    const four = run([{ type: 'clipsChanged', keys: ['a', 'b', 'c', 'd'] }], loaded());
    const fromAdded = (key: string) =>
      run(
        [
          { type: 'select', key },
          { type: 'discarded', keys: ['a', 'b', 'c'] },
        ],
        four
      ).selection;
    // 'd' was added after the live reel: its place (4th) is past the live reel's end.
    expect(fromAdded('d')).toEqual({ kind: 'clip', key: 'a' });
    const swapped = run([{ type: 'clipsChanged', keys: ['a', 'x', 'c'] }], loaded());
    expect(
      run(
        [
          { type: 'select', key: 'x' },
          { type: 'discarded', keys: ['a', 'b', 'c'] },
        ],
        swapped
      ).selection
    ).toEqual({
      kind: 'clip',
      key: 'b',
    });
    // The clipsChanged that follows keeps it.
    expect(
      run(
        [
          { type: 'select', key: 'd' },
          { type: 'discarded', keys: ['a', 'b', 'c'] },
          { type: 'clipsChanged', keys: ['a', 'b', 'c'] },
        ],
        four
      ).selection
    ).toEqual({ kind: 'clip', key: 'a' });
  });

  it('opens the Add picker, nothing selected, when the discard leaves no reel', () => {
    const after = run(
      [
        { type: 'select', key: 'b' },
        { type: 'discarded', keys: [] },
        { type: 'clipsChanged', keys: [] },
      ],
      loaded()
    );
    expect(after).toMatchObject({ selection: { kind: 'none' }, panel: 'add' });
  });

  describe('Esc', () => {
    it('closes a popover first, then the panel, then the selection, one level per press', () => {
      let state = run(
        [
          { type: 'openPanel', panel: 'warnings' },
          { type: 'openPopover', popover: 'menu' },
        ],
        loaded()
      );
      expect(escapeTarget(state)).toBe('popover');
      state = editorReducer(state, { type: 'escape' });
      expect(state).toMatchObject({ popover: null, panel: 'warnings', selection: { kind: 'clip', key: 'a' } });
      expect(escapeTarget(state)).toBe('panel');
      state = editorReducer(state, { type: 'escape' });
      expect(state).toMatchObject({ panel: 'transcript', selection: { kind: 'clip', key: 'a' } });
      expect(escapeTarget(state)).toBe('selection');
      state = editorReducer(state, { type: 'escape' });
      expect(state.selection).toEqual({ kind: 'none' });
      expect(escapeTarget(state)).toBeNull();
      expect(editorReducer(state, { type: 'escape' })).toBe(state);
    });
  });

  describe('playback', () => {
    it('plays a reel over the given keys and restores the selection when stopped', () => {
      const playing = run(
        [
          { type: 'select', key: 'b' },
          { type: 'playReel', keys: ['a', 'c'], list: ['a', 'b', 'c'] },
        ],
        loaded()
      );
      expect(playing.playback).toMatchObject({
        mode: 'reel',
        keys: ['a', 'c'],
        index: 0,
        returnTo: { kind: 'clip', key: 'b' },
      });
      const stopped = editorReducer(playing, { type: 'stop' });
      expect(stopped.playback).toEqual({ mode: 'idle' });
      expect(selectedKey(stopped)).toBe('b');
    });

    it('stops at the end of the reel, and a second Play reel stops it', () => {
      const playing = run([{ type: 'playReel', keys: ['a', 'b'], list: ['a', 'b', 'c'] }], loaded());
      expect(run([{ type: 'reelAt', index: 1 }], playing).playback).toMatchObject({ mode: 'reel', index: 1 });
      expect(run([{ type: 'reelAt', index: 2 }], playing).playback).toEqual({ mode: 'idle' });
      expect(run([{ type: 'playReel', keys: ['a', 'b'], list: ['a', 'b', 'c'] }], playing).playback).toEqual({
        mode: 'idle',
      });
    });

    it('plays nothing when no clip has a cut to play', () => {
      expect(run([{ type: 'playReel', keys: [], list: ['a'] }], loaded()).playback).toEqual({ mode: 'idle' });
    });

    it('stops when the clips change under it, restoring the selection only if that clip is still there', () => {
      const playing = run(
        [
          { type: 'select', key: 'b' },
          { type: 'playReel', keys: ['a', 'b', 'c'], list: ['a', 'b', 'c'] },
        ],
        loaded()
      );
      const kept = run([{ type: 'clipsChanged', keys: ['a', 'b'] }], playing);
      expect(kept.playback).toEqual({ mode: 'idle' });
      expect(selectedKey(kept)).toBe('b');
      const lost = run([{ type: 'clipsChanged', keys: ['a', 'c'] }], playing);
      expect(lost.playback).toEqual({ mode: 'idle' });
      expect(selectedKey(lost)).toBeNull();
      // The same clips again (a refetch with nothing changed) leave it playing.
      expect(run([{ type: 'clipsChanged', keys: ['a', 'b', 'c'] }], playing).playback.mode).toBe('reel');
    });

    it('stops a reel when a clip is selected, selecting that clip', () => {
      const playing = run([{ type: 'playReel', keys: ['a', 'b'], list: ['a', 'b', 'c'] }], loaded());
      const state = editorReducer(playing, { type: 'select', key: 'c' });
      expect(state.playback).toEqual({ mode: 'idle' });
      expect(selectedKey(state)).toBe('c');
    });

    it('tracks the loading hold between reel clips, cleared when the next clip plays', () => {
      const playing = run(
        [
          { type: 'playReel', keys: ['a', 'b'], list: ['a', 'b', 'c'] },
          { type: 'reelLoading', loading: true },
        ],
        loaded()
      );
      expect(playing.playback).toMatchObject({ loading: true });
      expect(editorReducer(playing, { type: 'reelAt', index: 1 }).playback).toMatchObject({ index: 1, loading: false });
    });

    it('plays a clip or the free debate, and a stop leaves the selection alone', () => {
      const clip = run([{ type: 'playClip', key: 'b' }], loaded());
      expect(clip.playback).toEqual({ mode: 'clip', key: 'b' });
      const free = run([{ type: 'playFree' }, { type: 'stop' }], loaded());
      expect(free.playback).toEqual({ mode: 'idle' });
      expect(selectedKey(free)).toBe('a');
      expect(run([{ type: 'clipsChanged', keys: ['a', 'c'] }], clip).playback).toEqual({ mode: 'idle' });
    });
  });
});

describe('reelKeys', () => {
  it('skips clips with no cut to play', () => {
    expect(reelKeys(['a', 'b', 'c'], [{}, null, {}], false)).toEqual(['a', 'c']);
  });

  it('plays every clip of a carried reel, which has no cuts on this video', () => {
    expect(reelKeys(['a', 'b'], [null, null], true)).toEqual(['a', 'b']);
  });
});

describe('the one rule for what is open (editorView)', () => {
  // Each case is a change to the data under an open panel or popover, opened on clip b (Add from its
  // card, on none). `state` changes what the reducer holds; `data` the clips and facts now.
  const KEYS = ['a', 'b', 'c'];
  const changes: Record<string, { state?: (state: EditorState) => EditorState; data?: Partial<EditorData> }> = {
    nothing: {},
    'another clip selected': { state: state => ({ ...state, selection: { kind: 'clip', key: 'a' } }) },
    'its clip gone': { data: { keys: ['a', 'c'] } },
    'read-only': { data: { readOnly: true } },
    'check no longer shown': { data: { checkShown: false } },
    'publish not allowed': { data: { canPublish: false } },
    'unlock not allowed': { data: { canUnlock: false } },
  };
  const opened = (open: EditorAction) =>
    open.type === 'startAdd' ? run([open], loaded(KEYS)) : run([{ type: 'select', key: 'b' }, open], loaded(KEYS));
  const shownAfter = (state: EditorState, change: string) => {
    const { state: change_state = (s: EditorState) => s, data = {} } = changes[change];
    return editorView(change_state(state), { keys: KEYS, ...NO_LIMITS, ...data });
  };

  const T = 'transcript';
  const panels: [EditorPanel, EditorAction, EditorPanel[]][] = [
    // nothing, another clip, clip gone, read-only, check gone, !publish, !unlock
    ['transcript', { type: 'closePanel' }, [T, T, T, T, T, T, T]],
    [
      'warnings',
      { type: 'openPanel', panel: 'warnings' },
      ['warnings', 'warnings', 'warnings', 'warnings', 'warnings', 'warnings', 'warnings'],
    ],
    ['check', { type: 'openPanel', panel: 'check' }, ['check', 'check', 'check', 'check', T, 'check', 'check']],
    ['claim', { type: 'openPanel', panel: 'claim' }, ['claim', T, T, T, 'claim', 'claim', 'claim']],
    ['replace', { type: 'openPanel', panel: 'replace' }, ['replace', T, T, T, 'replace', 'replace', 'replace']],
    // Opened from its card, on none: a selection is another clip; no selected clip can go.
    ['add', { type: 'startAdd' }, ['add', T, 'add', T, 'add', 'add', 'add']],
  ];
  describe.each(panels)('the %s panel', (_, open, expected) => {
    it.each(Object.keys(changes).map((change, at) => [change, expected[at]] as const))(
      'after %s: %s',
      (change, panel) => {
        expect(shownAfter(opened(open), change).panel).toBe(panel);
      }
    );
  });

  const popovers: [EditorPopover, (EditorPopover | null)[]][] = [
    ['menu', ['menu', 'menu', 'menu', 'menu', 'menu', 'menu', 'menu']],
    ['publish', ['publish', 'publish', 'publish', 'publish', 'publish', null, 'publish']],
    ['unlock', ['unlock', 'unlock', 'unlock', 'unlock', 'unlock', 'unlock', null]],
    ['claimMenu', ['claimMenu', null, null, null, 'claimMenu', 'claimMenu', 'claimMenu']],
    ['advanced', ['advanced', null, null, null, 'advanced', 'advanced', 'advanced']],
  ];
  describe.each(popovers)('the %s popover', (popover, expected) => {
    it.each(Object.keys(changes).map((change, at) => [change, expected[at]] as const))(
      'after %s: %s',
      (change, shown) => {
        expect(shownAfter(opened({ type: 'openPopover', popover }), change).popover).toBe(shown);
      }
    );
  });

  it('shows the clip in a gone clip’s place before the reducer hears of the change', () => {
    const state = run([{ type: 'select', key: 'b' }], loaded(KEYS));
    expect(editorView(state, { keys: ['a', 'c'], ...NO_LIMITS }).selection).toEqual({ kind: 'clip', key: 'c' });
    expect(editorView(loaded([]), { keys: ['x'], ...NO_LIMITS }).selection).toEqual({ kind: 'clip', key: 'x' });
  });

  it('keeps what the facts closed closed once they allow it again', () => {
    const claim = run(
      [
        { type: 'select', key: 'b' },
        { type: 'openPanel', panel: 'claim' },
      ],
      loaded(KEYS)
    );
    const readOnly = editorReducer(claim, { type: 'settle', facts: { ...NO_LIMITS, readOnly: true } });
    expect(readOnly.panel).toBe('transcript');
    expect(editorReducer(readOnly, { type: 'settle', facts: NO_LIMITS }).panel).toBe('transcript');
    const check = run([{ type: 'openPanel', panel: 'check' }], loaded(KEYS));
    const gone = editorReducer(check, { type: 'settle', facts: { ...NO_LIMITS, checkShown: false } });
    expect(editorReducer(gone, { type: 'settle', facts: NO_LIMITS }).panel).toBe('transcript');
    // Nothing to close leaves the state as it was, so the editor's settle never re-renders it.
    expect(editorReducer(check, { type: 'settle', facts: NO_LIMITS })).toBe(check);
  });

  it('keeps a flagged clip’s claim panel when the panel moves with it, and not a healthy one’s, even re-picked', () => {
    const claim = run(
      [
        { type: 'select', key: 'b' },
        { type: 'openPanel', panel: 'claim' },
      ],
      loaded(KEYS)
    );
    expect(run([{ type: 'select', key: 'b' }], claim).panel).toBe('transcript');
    expect(run([{ type: 'select', key: 'c', flagged: true }], claim)).toMatchObject({ panel: 'claim', panelFor: 'c' });
    expect(run([{ type: 'select', key: 'c' }], claim).panel).toBe('transcript');
  });

  it('lets Esc pass over a panel that is no longer open, to the selection', () => {
    const claim = run(
      [
        { type: 'select', key: 'b' },
        { type: 'openPanel', panel: 'claim' },
      ],
      loaded(KEYS)
    );
    expect(escapeTarget(editorView(claim, { keys: KEYS, ...NO_LIMITS, readOnly: true }))).toBe('selection');
  });
});
