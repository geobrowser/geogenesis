import { describe, expect, it } from 'vitest';

import {
  type EditorAction,
  type EditorState,
  INITIAL_EDITOR_STATE,
  editorReducer,
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
