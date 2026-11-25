import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ActionContext } from '~/core/action-context';

const mocks = vi.hoisted(() => ({ capture: vi.fn() }));
vi.mock('~/core/analytics', () => ({ capture: mocks.capture, analyticsContextRevision: () => 0 }));

const CENTRE = '3689bd216406451a9e506e85d1e397d7';
const TOPIC = '4ed3162278994f29bde7a6f7cf60e28e';
const SPACE = '89bd89bf28ff8a0963faf92a8c905e20';
const ids = { entityId: CENTRE, topicId: TOPIC, spaceId: SPACE };
const context = { component: 'share_dialog', page_type: 'graph_explorer', target_id: CENTRE } as ActionContext;

let share: typeof import('./graph-share');
const fetchMock = vi.fn(async () => new Response(''));

beforeEach(async () => {
  vi.resetModules();
  share = await import('./graph-share');
  mocks.capture.mockReset();
  fetchMock.mockClear();
  vi.stubGlobal('fetch', fetchMock);
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: vi.fn(async () => {}) } });
  window.history.replaceState({}, '', `/explore/graph/${CENTRE}?topic=${TOPIC}&space=${SPACE}&trail=abc`);
});
afterEach(() => {
  vi.unstubAllGlobals();
  Object.defineProperty(navigator, 'share', { configurable: true, value: undefined });
});

describe('sharing a graph', () => {
  it('copies a short link to centre, topic and space only, records a graph share and warms the card', async () => {
    expect(await share.shareGraph(ids, context, { nativeShare: false })).toBe('copied');
    const copied = new URL(vi.mocked(navigator.clipboard.writeText).mock.calls[0][0]);
    expect(copied.pathname).toBe(`/explore/graph/${CENTRE}`);
    expect([...copied.searchParams.keys()]).toEqual(['topic', 'space', 'si']);
    expect(copied.searchParams.get('si')?.slice(0, 2)).toBe('cg');
    expect(mocks.capture).toHaveBeenCalledWith(
      'share_link_handoff',
      expect.objectContaining({
        share_content_type: 'graph',
        share_content_id: CENTRE,
        method: 'copy_link',
        handoff_kind: 'copied',
        page_type: 'graph_explorer',
      })
    );
    expect(fetchMock).toHaveBeenCalledWith(`/explore/graph/${CENTRE}/card?topic=${TOPIC}&space=${SPACE}&v=1`, {
      priority: 'low',
    });
  });

  it('carries the chip in view as ?kinds=, and leaves it off under Everything', async () => {
    await share.shareGraph(ids, context, { nativeShare: false, kindFilter: 'claim' });
    const copied = new URL(vi.mocked(navigator.clipboard.writeText).mock.calls[0][0]);
    expect([...copied.searchParams.keys()]).toEqual(['topic', 'space', 'kinds', 'si']);
    expect(copied.searchParams.get('kinds')).toBe('claim');
    expect(share.graphShareUrl('https://x', ids, 'all')).toBe(`https://x/explore/graph/${CENTRE}?topic=${TOPIC}&space=${SPACE}`);
  });

  it('uses the share sheet on phones and copies when it is missing', async () => {
    const sheet = vi.fn(async (_data: ShareData) => {});
    Object.defineProperty(navigator, 'share', { configurable: true, value: sheet });
    expect(await share.shareGraph(ids, context, { nativeShare: true })).toBe('shared');
    expect(new URL(sheet.mock.calls[0]![0]!.url!).searchParams.get('si')?.slice(0, 2)).toBe('ng');
    expect(mocks.capture).toHaveBeenCalledWith(
      'share_link_handoff',
      expect.objectContaining({ method: 'native_share', handoff_kind: 'composer_requested' })
    );

    sheet.mockRejectedValueOnce(new DOMException('cancelled', 'AbortError'));
    expect(await share.shareGraph(ids, context, { nativeShare: true })).toBe('cancelled');
    expect(navigator.clipboard.writeText).not.toHaveBeenCalled();

    Object.defineProperty(navigator, 'share', { configurable: true, value: undefined });
    expect(await share.shareGraph(ids, context, { nativeShare: true })).toBe('copied');
  });

  it('warms each card once per page load, never waits on it and ignores failures', async () => {
    let settle!: () => void;
    const slow = vi.fn(() => new Promise<Response>((_, reject) => (settle = () => reject(new Error('down')))));
    share.warmGraphCard(ids, slow);
    share.warmGraphCard(ids, slow);
    share.warmGraphCard({ ...ids, spaceId: null }, slow);
    expect(slow).toHaveBeenCalledTimes(2);
    settle();
    await Promise.resolve();
    expect(() =>
      share.warmGraphCard(ids, () => {
        throw new Error('no fetch');
      })
    ).not.toThrow();
  });

  it('still copies when warming throws', async () => {
    fetchMock.mockImplementationOnce(() => {
      throw new Error('blocked');
    });
    expect(await share.shareGraph(ids, context, { nativeShare: false })).toBe('copied');
  });
});

describe('landing on a shared link', () => {
  const SHARE = '22222222222242228222222222222222';

  it('reads the graph share and leaves the tags in the URL for analytics', () => {
    const tagged = `/explore/graph/${CENTRE}?topic=${TOPIC}&utm_source=copy_link&utm_medium=share&utm_campaign=geo_share&utm_content=v1:graph:${CENTRE}:${SHARE}`;
    window.history.replaceState({}, '', tagged);
    share.recordGraphShareLanding();
    expect(share.graphShareLanding()).toMatchObject({ share_content_type: 'graph', share_id: SHARE });
    expect(window.location.pathname + window.location.search).toBe(tagged);
  });

  it('records nothing for an untagged landing or another kind of share', () => {
    window.history.replaceState({}, '', `/explore/graph/${CENTRE}?topic=${TOPIC}`);
    share.recordGraphShareLanding();
    expect(share.graphShareLanding()).toBeNull();
    window.history.replaceState(
      {},
      '',
      `/explore/graph/${CENTRE}?utm_source=x&utm_medium=share&utm_campaign=geo_share&utm_content=v1:debate:${CENTRE}:${SHARE}`
    );
    share.recordGraphShareLanding();
    expect(share.graphShareLanding()).toBeNull();
  });
});

describe('in-app entry', () => {
  it('is marked in memory, taken once and expires after a minute', () => {
    vi.useFakeTimers();
    share.markGraphExplorerEntry('topic_page');
    expect(share.takeGraphExplorerEntry()).toBe('topic_page');
    expect(share.takeGraphExplorerEntry()).toBeNull();
    share.markGraphExplorerEntry('topic_page');
    vi.advanceTimersByTime(60_001);
    expect(share.takeGraphExplorerEntry()).toBeNull();
    vi.useRealTimers();
  });
});
