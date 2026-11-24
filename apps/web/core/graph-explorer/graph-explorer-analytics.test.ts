import { renderHook } from '@testing-library/react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { pageContext } from '~/core/action-context';
import { capture } from '~/core/analytics';

import { classifyEntry, startGraphExplorerSession, useGraphExplorerSession } from './graph-explorer-analytics';
import { markGraphExplorerEntry } from './graph-share';

vi.mock('~/core/analytics', () => ({ capture: vi.fn() }));

const sent = () => vi.mocked(capture).mock.calls.map(([name, props]) => ({ name, props: props ?? {} }));
const named = (name: string) => sent().filter(event => event.name === name);

let clock = 0;
const now = () => clock;
const init = { entityId: 'gaza', topicId: 'gaza', spaceId: 'space', trailDepth: 0 };
const layout = { layout: 'desktop' as const, trailDepth: 0 };

beforeEach(() => {
  clock = 1_000;
  vi.mocked(capture).mockClear();
});
afterEach(() => vi.restoreAllMocks());

describe('classifyEntry', () => {
  const none = {
    share: null,
    inApp: null,
    navigationType: 'navigate',
    firstRoute: false,
    popstate: false,
    externalReferrer: false,
  };
  it('reads the share, the in-app mark, history, the first route and the referrer, in that order', () => {
    expect(classifyEntry({ ...none, share: { share_id: 's', method: 'copy_link' }, inApp: 'topic_page' })).toBe(
      'shared_link'
    );
    expect(classifyEntry({ ...none, inApp: 'topic_page' })).toBe('in_app');
    expect(classifyEntry({ ...none, popstate: true })).toBe('history');
    expect(classifyEntry({ ...none, firstRoute: true, navigationType: 'reload' })).toBe('reload');
    expect(classifyEntry({ ...none, firstRoute: true, navigationType: 'back_forward' })).toBe('history');
    expect(classifyEntry({ ...none, firstRoute: true, externalReferrer: true })).toBe('external_link');
    expect(classifyEntry({ ...none, firstRoute: true })).toBe('direct');
    expect(classifyEntry(none)).toBe('internal_link');
  });
});

describe('a graph explorer session', () => {
  it('sends opened once, with the in-app entry point, and every event unstamped and without text', () => {
    markGraphExplorerEntry('topic_page');
    const session = startGraphExplorerSession(init, now);
    clock += 420;
    session.opened('ready', { ...layout, entityKind: 'topic' });
    session.opened('ready', layout);
    session.tag('node', 'idf', 'ent');
    session.recentred('idf', { trailDepth: 1, kindFilter: 'all' });
    session.interacted({ interaction: 'search', result_count: 3 });
    session.left('unmount');

    expect(named('graph_explorer_opened')).toEqual([
      {
        name: 'graph_explorer_opened',
        props: {
          graph_session_id: session.id,
          entity_id: 'gaza',
          topic_id: 'gaza',
          space_id: 'space',
          entry: 'in_app',
          entry_point: 'topic_page',
          load_outcome: 'ready',
          ready_ms: 420,
          layout: 'desktop',
          trail_depth: 0,
          entity_kind: 'topic',
        },
      },
    ]);
    for (const { props } of sent()) {
      expect(props).not.toHaveProperty('measurement_version');
      for (const key of Object.keys(props)) expect(key).not.toMatch(/^(name|text|source|session_id|duration.*)$/);
      expect(Object.values(props)).not.toContain(null);
    }
  });

  it('numbers hops, takes the tagged method for that target and defaults to history', () => {
    const session = startGraphExplorerSession(init, now);
    session.opened('ready', layout);
    session.tag('node', 'idf', 'ent');
    session.recentred('idf', { trailDepth: 1, kindFilter: 'all' });
    // A tag for a hop that never happened does not label the next one.
    session.tag('search', 'hamas');
    session.recentred('gaza', { trailDepth: 0, kindFilter: 'claim' });
    session.recentred('gaza', { trailDepth: 0, kindFilter: 'claim' });

    expect(named('graph_explorer_recentred').map(event => event.props)).toEqual([
      expect.objectContaining({
        entity_id: 'idf',
        from_entity_id: 'gaza',
        method: 'node',
        hop_index: 1,
        entity_kind: 'ent',
        trail_depth: 1,
        centres: 2,
      }),
      expect.objectContaining({
        entity_id: 'gaza',
        from_entity_id: 'idf',
        method: 'history',
        hop_index: 2,
        centres: 2,
      }),
    ]);
    expect(named('graph_explorer_recentred')[1].props).not.toHaveProperty('entity_kind');
  });

  it('sends rotate and zoom once per centre, summary_seen once, and each filter and open', () => {
    const session = startGraphExplorerSession(init, now);
    session.opened('ready', layout);
    for (let frame = 0; frame < 120; frame++) {
      session.interacted({ interaction: 'rotate' });
      session.interacted({ interaction: 'zoom', value: 'gesture' });
    }
    session.interacted({ interaction: 'summary_seen' });
    session.interacted({ interaction: 'summary_seen' });
    session.recentred('idf', { trailDepth: 1, kindFilter: 'all' });
    session.interacted({ interaction: 'rotate' });
    session.interacted({ interaction: 'filter', value: 'claim' });
    session.interacted({ interaction: 'filter', value: 'all' });
    session.interacted({ interaction: 'open_page', value: 'claim', target_id: 'c1' });

    expect(named('graph_explorer_interacted').map(({ props }) => [props.entity_id, props.interaction])).toEqual([
      ['gaza', 'rotate'],
      ['gaza', 'zoom'],
      ['gaza', 'summary_seen'],
      ['idf', 'rotate'],
      ['idf', 'filter'],
      ['idf', 'filter'],
      ['idf', 'open_page'],
    ]);
  });

  it('leaves through a claim opened just before, else navigated, and counts only visible time', () => {
    const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
    const session = startGraphExplorerSession(init, now);
    session.opened('ready', layout);
    clock += 1_000;
    visibility.mockReturnValue('hidden');
    document.dispatchEvent(new Event('visibilitychange'));
    clock += 5_000;
    visibility.mockReturnValue('visible');
    document.dispatchEvent(new Event('visibilitychange'));
    clock += 500;
    session.interacted({ interaction: 'open_page', value: 'claim', target_id: 'c1' });
    clock += 1_000;
    session.left('unmount');

    expect(named('graph_explorer_left')[0].props).toEqual(
      expect.objectContaining({
        exit: 'open_claim',
        target_id: 'c1',
        hops: 0,
        active_ms: 2_500,
        time_in_view_ms: 7_500,
        ready_ms: 0,
      })
    );

    vi.mocked(capture).mockClear();
    const later = startGraphExplorerSession(init, now);
    later.opened('error', layout);
    later.interacted({ interaction: 'open_page', value: 'entity', target_id: 'e1' });
    clock += 2_001;
    later.left('unmount');
    const left = named('graph_explorer_left')[0].props;
    expect(left.exit).toBe('navigated');
    expect(left).not.toHaveProperty('target_id');
    expect(left).not.toHaveProperty('ready_ms');
  });

  it('marks close, and sends nothing on leaving before the first centre settled', () => {
    const closed = startGraphExplorerSession(init, now);
    closed.opened('ready', layout);
    closed.markExit('close');
    closed.left('unmount');
    expect(named('graph_explorer_left')[0].props.exit).toBe('close');

    vi.mocked(capture).mockClear();
    startGraphExplorerSession(init, now).left('unmount');
    expect(sent()).toEqual([]);
  });
});

describe('graph_explorer_left page context', () => {
  const GAZA = '4ed3162278994f29bde7a6f7cf60e28e';
  const CLAIM = '69727edb0a7848f1ad833ce6a99012db';
  const SPACE = '89bd89bf28ff8a0963faf92a8c905e20';
  afterEach(() => window.history.replaceState(null, '', '/'));

  it('keeps the explorer’s last page view when an open claim took the app to the claim’s page', () => {
    window.history.replaceState(null, '', `/explore/graph/${GAZA}?topic=${GAZA}`);
    const session = startGraphExplorerSession({ ...init, entityId: GAZA }, now);
    session.opened('ready', layout);
    window.history.replaceState(null, '', `/explore/graph/${CLAIM}?topic=${GAZA}`);
    session.recentred(CLAIM, { trailDepth: 1, kindFilter: 'all' });
    session.interacted({ interaction: 'open_page', value: 'claim', target_id: CLAIM });
    const onExplorer = pageContext().page_view_id;
    window.history.replaceState(null, '', `/space/${SPACE}/${CLAIM}`);
    session.left('unmount');

    expect(named('graph_explorer_left')[0].props).toEqual(
      expect.objectContaining({
        exit: 'open_claim',
        page_type: 'graph_explorer',
        page_path: `/explore/graph/${CLAIM}`,
        page_view_id: onExplorer,
        page_entity_id: CLAIM,
      })
    );
  });

  it('keeps it on close, too', () => {
    window.history.replaceState(null, '', `/explore/graph/${GAZA}?topic=${GAZA}`);
    const session = startGraphExplorerSession({ ...init, entityId: GAZA }, now);
    session.opened('ready', layout);
    const onExplorer = pageContext().page_view_id;
    session.markExit('close');
    window.history.replaceState(null, '', `/space/${SPACE}/${GAZA}`);
    session.left('unmount');

    expect(named('graph_explorer_left')[0].props).toEqual(
      expect.objectContaining({
        exit: 'close',
        page_type: 'graph_explorer',
        page_path: `/explore/graph/${GAZA}`,
        page_view_id: onExplorer,
      })
    );
  });
});

describe('useGraphExplorerSession', () => {
  it('sends one left for pagehide followed by the unmount', () => {
    const { result, unmount } = renderHook(() => useGraphExplorerSession(init));
    result.current!.opened('ready', layout);
    window.dispatchEvent(new Event('pagehide'));
    unmount();
    expect(named('graph_explorer_left').map(({ props }) => props.exit)).toEqual(['page_hidden']);
  });

  it('sends navigated on an unmount without pagehide', () => {
    const { result, unmount } = renderHook(() => useGraphExplorerSession(init));
    result.current!.opened('ready', layout);
    unmount();
    window.dispatchEvent(new Event('pagehide'));
    expect(named('graph_explorer_left').map(({ props }) => props.exit)).toEqual(['navigated']);
  });
});
