import { act, cleanup, renderHook } from '@testing-library/react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const reportDebateRequestReceipt = vi.fn((_receipt: unknown, _token: unknown, _accountKey: unknown) =>
  Promise.resolve(undefined)
);
vi.mock('./api', () => ({
  reportDebateRequestReceipt: (receipt: unknown, token: unknown, accountKey: unknown) =>
    reportDebateRequestReceipt(receipt, token, accountKey),
}));

const { useDebateRequestReceipts } = await import('./debate-request-receipts');

type Pending = { kind: 'challenge' | 'claim_request'; id: string }[];
const getToken = () => Promise.resolve('token');
const mount = (pending: Pending, enabled = true) =>
  renderHook(({ items }) => useDebateRequestReceipts(enabled, items, getToken, 'account-1'), {
    initialProps: { items: pending },
  });
const stages = () =>
  reportDebateRequestReceipt.mock.calls.map(([receipt]) => {
    const { kind, request_id, stage } = receipt as { kind: string; request_id: string; stage: string };
    return `${kind}:${request_id}:${stage}`;
  });
const click = () =>
  act(() => {
    window.dispatchEvent(new Event('pointerdown'));
  });

// GEO-3119: "I never got it" has to be checkable. Delivered means this tab had it; seen means a
// person used the visible tab while it was pending.
describe('debate request receipts', () => {
  let visibilityState: DocumentVisibilityState;

  beforeEach(() => {
    reportDebateRequestReceipt.mockClear();
    visibilityState = 'visible';
    vi.spyOn(document, 'visibilityState', 'get').mockImplementation(() => visibilityState);
  });
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('reports delivery once when a request arrives, and nothing is seen without input', () => {
    const view = mount([{ kind: 'challenge', id: 'c1' }]);
    view.rerender({ items: [{ kind: 'challenge', id: 'c1' }] });
    expect(stages()).toEqual(['challenge:c1:delivered']);
  });

  // The 1 Oct case: a visible tab, nobody at it. Delivered, never seen.
  it('marks a request seen only on real input in a visible tab', () => {
    mount([{ kind: 'claim_request', id: 'r1' }]);
    visibilityState = 'hidden';
    click();
    expect(stages()).toEqual(['claim_request:r1:delivered']);

    visibilityState = 'visible';
    click();
    click();
    expect(stages()).toEqual(['claim_request:r1:delivered', 'claim_request:r1:seen']);
  });

  it('only reports what is pending now', () => {
    const view = mount([{ kind: 'challenge', id: 'c1' }]);
    view.rerender({ items: [] });
    click();
    expect(stages()).toEqual(['challenge:c1:delivered']);
  });

  it('does nothing signed out', () => {
    mount([{ kind: 'challenge', id: 'c1' }], false);
    click();
    expect(reportDebateRequestReceipt).not.toHaveBeenCalled();
  });
});
