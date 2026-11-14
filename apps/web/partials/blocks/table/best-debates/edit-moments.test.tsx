import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';

import type * as React from 'react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { EditMomentsMenu, NEW_REEL_LIVE_COPY, REEL_RENDER_FAILED_COPY, ReelRenderWatcher } from './edit-moments';

const mocks = vi.hoisted(() => ({
  backfill: { data: undefined as unknown, refetch: vi.fn() },
  setToast: vi.fn(),
}));

vi.mock('~/core/debates/moments-editor/hooks', () => ({
  useMomentBackfill: () => mocks.backfill,
}));
vi.mock('~/core/hooks/use-toast', () => ({ useSetToast: () => mocks.setToast }));

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
vi.stubGlobal('ResizeObserver', ResizeObserverStub);

const HEX = '0f2b5e0c7d1a4b3c9e8f7a6b5c4d3e2f';
const UUID = '0f2b5e0c-7d1a-4b3c-9e8f-7a6b5c4d3e2f';
const SPACE = '9284477c8fe746368698994e2e517b32';

function wrap(children: React.ReactNode, client = new QueryClient()) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  mocks.backfill = { data: undefined, refetch: vi.fn() };
  mocks.setToast.mockReset();
});
afterEach(cleanup);

describe('EditMomentsMenu (GEO-3742)', () => {
  it('opens the editor in a tab of its own, with no opener, from the shared Admin item', () => {
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    const onOpen = vi.fn();
    render(wrap(<EditMomentsMenu entityId={HEX} spaceId={SPACE} onOpen={onOpen} />));
    fireEvent.click(screen.getByRole('button', { name: 'More debate options' }));
    const item = screen.getByRole('button', { name: /Edit moments/ });
    expect(item).toHaveTextContent('Admin');
    expect(item).toHaveAttribute('data-geo-analytics-label', 'Edit moments');
    // Desktop only, like the feed's item.
    expect(item).toHaveClass('md:hidden');
    fireEvent.click(item);
    expect(open).toHaveBeenCalledWith(`/space/${SPACE}/debates/${UUID}/moments?close=1`, '_blank', 'noopener');
    expect(onOpen).toHaveBeenCalledWith(HEX);
    open.mockRestore();
  });
});

describe('ReelRenderWatcher (GEO-3742)', () => {
  const request = (status: string, requestedAt: string, extra: Record<string, unknown> = {}) => ({
    request: { status, requested_at: requestedAt, preview: false, unlock: false, report: null, ...extra },
  });

  function setup() {
    const client = new QueryClient();
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    const view = render(wrap(<ReelRenderWatcher entityId={HEX} />, client));
    const rerender = () => view.rerender(wrap(<ReelRenderWatcher entityId={HEX} />, client));
    return { invalidate, rerender };
  }

  it('swaps in the new reel and says so once its render is done', () => {
    mocks.backfill.data = request('done', '2026-11-13T09:00:00Z');
    const { invalidate, rerender } = setup();
    expect(mocks.setToast).not.toHaveBeenCalled();
    mocks.backfill = { ...mocks.backfill, data: request('running', '2026-11-14T10:01:00Z') };
    rerender();
    expect(mocks.setToast).not.toHaveBeenCalled();
    mocks.backfill = { ...mocks.backfill, data: request('done', '2026-11-14T10:01:00Z') };
    rerender();
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['debates', 'moments-player', HEX] });
    expect(mocks.setToast).toHaveBeenCalledTimes(1);
    rerender();
    expect(mocks.setToast).toHaveBeenCalledTimes(1);
  });

  it('says when the render failed, and leaves the reel', () => {
    mocks.backfill.data = request('done', '2026-11-13T09:00:00Z');
    const { invalidate, rerender } = setup();
    mocks.backfill = { ...mocks.backfill, data: request('failed', '2026-11-14T10:01:00Z') };
    rerender();
    expect(invalidate).not.toHaveBeenCalled();
    const toast = mocks.setToast.mock.calls[0][0] as React.ReactElement<{ children: string }>;
    expect(toast.props.children).toBe(REEL_RENDER_FAILED_COPY);
  });

  it('ignores the request there was when it started, even one still rendering', () => {
    mocks.backfill.data = request('running', '2026-11-14T10:00:30Z');
    const { invalidate, rerender } = setup();
    mocks.backfill = { ...mocks.backfill, data: request('done', '2026-11-14T10:00:30Z') };
    rerender();
    expect(invalidate).not.toHaveBeenCalled();
    expect(mocks.setToast).not.toHaveBeenCalled();
  });

  it('re-reads the moments after a preview, with no toast, so a publish before it isn’t missed', () => {
    mocks.backfill.data = request('done', '2026-11-13T09:00:00Z');
    const { invalidate, rerender } = setup();
    // Published and then previewed while this tab was hidden: only the preview is the latest.
    mocks.backfill = { ...mocks.backfill, data: request('done', '2026-11-14T10:02:00Z', { preview: true }) };
    rerender();
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['debates', 'moments-player', HEX] });
    expect(mocks.setToast).not.toHaveBeenCalled();
  });

  it('never compares geo-chat’s times with this browser’s clock', () => {
    // This browser is a day ahead of geo-chat: a render queued now still counts.
    vi.useFakeTimers({ now: Date.parse('2026-11-15T10:00:00Z'), toFake: ['Date'] });
    mocks.backfill.data = request('done', '2026-11-13T09:00:00Z');
    const { rerender } = setup();
    mocks.backfill = { ...mocks.backfill, data: request('done', '2026-11-14T10:01:00Z') };
    rerender();
    expect(mocks.setToast).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it('reads the render again when this tab comes back into view', () => {
    mocks.backfill.data = request('done', '2026-11-13T09:00:00Z');
    setup();
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(mocks.backfill.refetch).toHaveBeenCalled();
  });

  it('names the toast copy as approved', () => {
    expect(NEW_REEL_LIVE_COPY).toBe('New reel is live');
    expect(REEL_RENDER_FAILED_COPY).toBe('Reel render failed – open Edit moments');
  });
});
