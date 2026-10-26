import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  DEBATE_TAB_CLAIM_TTL_MS,
  claimDebateEntry,
  clearDebateTabClaim,
  debateRematchDestinationClaimKey,
  debateRoomClaimKey,
  hasForeignDebateTabClaim,
  resetDebateTabIdForTests,
  writeDebateTabClaim,
} from './debate-tab-claims';

const key = debateRoomClaimKey('debate-1');

/** Writes a claim as another tab would, through the shared storage. */
function claimFromAnotherTab(at = Date.now()) {
  localStorage.setItem(`geo:debate-tab-claim:${key}`, JSON.stringify({ tabId: 'other-tab', at }));
}

beforeEach(() => {
  localStorage.clear();
  resetDebateTabIdForTests('this-tab');
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  Object.defineProperty(navigator, 'locks', { configurable: true, value: undefined });
});

describe('debate tab claims', () => {
  it('sees another live tab, never itself, and forgets a tab that went quiet', () => {
    expect(hasForeignDebateTabClaim(key)).toBe(false);
    writeDebateTabClaim(key);
    expect(hasForeignDebateTabClaim(key)).toBe(false);

    const now = Date.now();
    claimFromAnotherTab(now);
    expect(hasForeignDebateTabClaim(key, now)).toBe(true);
    expect(hasForeignDebateTabClaim(key, now + DEBATE_TAB_CLAIM_TTL_MS)).toBe(false);
  });

  it("clears only this tab's own claim", () => {
    claimFromAnotherTab();
    clearDebateTabClaim(key);
    expect(hasForeignDebateTabClaim(key)).toBe(true);

    writeDebateTabClaim(key);
    clearDebateTabClaim(key);
    expect(localStorage.getItem(`geo:debate-tab-claim:${key}`)).toBeNull();
  });

  it('ignores a malformed record', () => {
    localStorage.setItem(`geo:debate-tab-claim:${key}`, '{not json');
    expect(hasForeignDebateTabClaim(key)).toBe(false);
  });

  it('keys a debate-again destination by the room once it has converted, by the session before', () => {
    expect(debateRematchDestinationClaimKey({ id: 's-1', status: 'browsing' })).toBe('rematch:s-1');
    expect(debateRematchDestinationClaimKey({ id: 's-1', status: 'converted', converted_debate_id: 'd-1' })).toBe(
      'debate:d-1'
    );
  });
});

describe('claimDebateEntry', () => {
  it('lets the focused tab go at once, taking the flow even from another tab', async () => {
    claimFromAnotherTab();
    await expect(claimDebateEntry(key, { getPriority: () => 2 })).resolves.toBe(true);
    expect(hasForeignDebateTabClaim(key)).toBe(false);
  });

  it('holds a background tab back when another tab already has the flow', async () => {
    vi.useFakeTimers();
    claimFromAnotherTab();
    const decision = claimDebateEntry(key, { getPriority: () => 0 });
    await vi.advanceTimersByTimeAsync(1_500);
    await expect(decision).resolves.toBe(false);
    // And it did not take the claim over.
    expect(hasForeignDebateTabClaim(key)).toBe(true);
  });

  it('lets a lone background tab go after its wait', async () => {
    vi.useFakeTimers();
    let settled = false;
    const decision = claimDebateEntry(key, { getPriority: () => 0 }).then(go => {
      settled = true;
      return go;
    });
    await vi.advanceTimersByTimeAsync(1_000);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(500);
    await expect(decision).resolves.toBe(true);
    expect(hasForeignDebateTabClaim(key)).toBe(false);
  });

  it('loses to the focused tab that claims while it waits — the 12:23 shape', async () => {
    // The tab in front of the viewer was still saving the previous recording when the hidden tab
    // learned where to go; the hidden tab must not get there first.
    vi.useFakeTimers();
    const hidden = claimDebateEntry(key, { getPriority: () => 0 });
    await vi.advanceTimersByTimeAsync(800);
    claimFromAnotherTab();
    await vi.advanceTimersByTimeAsync(700);
    await expect(hidden).resolves.toBe(false);
  });

  it('cuts the wait short when the tab gains focus, and then goes regardless', async () => {
    vi.useFakeTimers();
    let priority: 0 | 2 = 0;
    claimFromAnotherTab();
    const decision = claimDebateEntry(key, { getPriority: () => priority });
    priority = 2;
    window.dispatchEvent(new Event('focus'));
    await vi.advanceTimersByTimeAsync(0);
    await expect(decision).resolves.toBe(true);
  });

  it('settles as a loss when aborted', async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    const decision = claimDebateEntry(key, { getPriority: () => 0, signal: controller.signal });
    controller.abort();
    await expect(decision).resolves.toBe(false);
  });

  it('decides under a Web Lock so two background tabs cannot both go', async () => {
    vi.useFakeTimers();
    const request = vi.fn((_name: string, _options: LockOptions, callback: () => unknown) =>
      Promise.resolve(callback())
    );
    Object.defineProperty(navigator, 'locks', { configurable: true, value: { request } });
    const decision = claimDebateEntry(key, { getPriority: () => 1 });
    await vi.advanceTimersByTimeAsync(400);
    await expect(decision).resolves.toBe(true);
    expect(request).toHaveBeenCalledWith(`geo:debate-tab-claim:${key}`, { mode: 'exclusive' }, expect.any(Function));
  });

  it('fails open without storage', async () => {
    vi.spyOn(window, 'localStorage', 'get').mockImplementation(() => {
      throw new Error('blocked');
    });
    await expect(claimDebateEntry(key, { getPriority: () => 0 })).resolves.toBe(true);
  });
});
