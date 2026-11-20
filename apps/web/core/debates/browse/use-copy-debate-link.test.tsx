import { act, cleanup, renderHook } from '@testing-library/react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { parseShareLink } from '~/core/sharing/share-link';

import { COPY_LINK_FAILED_COPY, LINK_COPIED_COPY, useCopyDebateLink } from './use-copy-debate-link';

const mocks = vi.hoisted(() => ({ capture: vi.fn(), toast: vi.fn() }));
vi.mock('~/core/analytics', () => ({ capture: mocks.capture, analyticsContextRevision: () => 0 }));
vi.mock('~/core/hooks/use-toast', () => ({ useToast: () => [null, mocks.toast] }));

const DEBATE = '11111111-1111-4111-8111-111111111111';
const DEBATE_HEX = '11111111111141118111111111111111';
const SPACE = '33333333333343338333333333333333';
const DEBATER = '22222222222242228222222222222222';

const events = (name: string) => mocks.capture.mock.calls.filter(([event]) => event === name).map(([, props]) => props);
const toastText = () => mocks.toast.mock.calls.map(([node]) => node.props.children);
const marketing = () =>
  ((window as { dataLayer?: Record<string, unknown>[] }).dataLayer ?? []).filter(entry => entry.event === 'geo_share');

function clipboard(writeText: (text: string) => Promise<void>) {
  const write = vi.fn(writeText);
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: write } });
  return write;
}

beforeEach(() => {
  (window as { dataLayer?: unknown[] }).dataLayer = [];
});
afterEach(() => {
  cleanup();
  mocks.capture.mockReset();
  mocks.toast.mockReset();
  delete (navigator as { clipboard?: unknown }).clipboard;
  delete window.lytics;
});

describe('useCopyDebateLink (GEO-3809)', () => {
  it('copies the tagged debates-app link and records the share for the surface that copied it', async () => {
    const write = clipboard(async () => {});
    window.lytics = {
      getContext: () => ({ is_identified: true }),
      getIdentity: () => ({ personal_space_id: DEBATER }),
    };
    const { result } = renderHook(() => useCopyDebateLink('best_debates_watch', DEBATE));
    await act(() =>
      result.current({ spaceId: SPACE, participants: [DEBATER], properties: { surface: 'best_debates_block' } })
    );

    expect(write).toHaveBeenCalledTimes(1);
    const url = new URL(write.mock.calls[0][0]);
    expect(`${url.origin}${url.pathname}`).toBe(`https://debates.geobrowser.io/debate/${DEBATE_HEX}`);
    expect(parseShareLink(url)).toMatchObject({ method: 'copy_link', share_content_type: 'debate' });
    expect(toastText()).toEqual([LINK_COPIED_COPY]);

    expect(events('share_link_handoff')).toEqual([
      expect.objectContaining({
        component: 'best_debates_watch',
        handoff_kind: 'copied',
        method: 'copy_link',
        space_id: SPACE,
        sharer_role: 'debater',
        share_id: parseShareLink(url)!.share_id,
      }),
    ]);
    expect(events('debate_share_action')).toEqual([
      { surface: 'best_debates_block', debate_id: DEBATE, space_id: SPACE, method: 'copy_link' },
    ]);
    expect(events('action_completed')).toEqual([
      expect.objectContaining({
        action_kind: 'share',
        component: 'best_debates_watch',
        target_id: DEBATE,
        outcome: 'succeeded',
      }),
    ]);
    expect(marketing()).toEqual([
      expect.objectContaining({ debate_id: DEBATE, space_id: SPACE, share_method: 'copy_link' }),
    ]);
  });

  it('says it could not copy, and records a failed share and no handoff, when the clipboard refuses', async () => {
    clipboard(async () => {
      throw new Error('denied');
    });
    const { result } = renderHook(() => useCopyDebateLink('best_debates_watch', DEBATE));
    await act(() => result.current({ spaceId: SPACE }));

    expect(toastText()).toEqual([COPY_LINK_FAILED_COPY]);
    expect(events('share_link_handoff')).toEqual([]);
    expect(events('debate_share_action')).toEqual([]);
    expect(events('action_completed')).toEqual([
      expect.objectContaining({ component: 'best_debates_watch', outcome: 'failed', failure_code: 'unavailable' }),
    ]);
    expect(marketing()).toEqual([]);
  });

  it('gives each copy its own share id', async () => {
    const write = clipboard(async () => {});
    const { result } = renderHook(() => useCopyDebateLink('share_dialog', DEBATE));
    await act(() => result.current({ spaceId: SPACE }));
    await act(() => result.current({ spaceId: SPACE }));
    const ids = write.mock.calls.map(([url]) => parseShareLink(url)!.share_id);
    expect(ids[0]).not.toBe(ids[1]);
  });
});
