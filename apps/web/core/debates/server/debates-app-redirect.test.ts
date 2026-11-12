import { afterEach, describe, expect, it, vi } from 'vitest';

import { HIDDEN_PROPERTY_ID } from '~/core/moderation/hidden';

import { DEBATE_TYPE_ID } from '../ontology';
import {
  couldBeDebateId,
  debatesAppRedirect,
  debatesAppRedirectEnabled,
  forgetDebateLookups,
} from './debates-app-redirect';

// GEO-3695: an old geobrowser.io debate URL opened from outside goes to the debates app.

const SPACE_ID = '4582fbbee28a16589154f7e36f1ee3c5';
const DEBATE_ID = '01a1d0d9443075708464dc8bf6c812bd';
const OTHER_ID = '3970e24854164ed5a4792d3e418088ef';

const entity = (extra: { types?: { id: string }[]; values?: unknown[] } = {}) => ({
  types: extra.types ?? [{ id: DEBATE_TYPE_ID }],
  values: extra.values ?? [],
});
type Fetch = NonNullable<Parameters<typeof debatesAppRedirect>[3]>['fetchEntity'];
let clock = 0;
const go = (fetchEntity: (...args: never[]) => Promise<unknown>, query = '', id = DEBATE_ID, timeoutMs?: number) =>
  debatesAppRedirect(SPACE_ID, id, new URLSearchParams(query), {
    fetchEntity: fetchEntity as Fetch,
    timeoutMs,
    now: () => clock,
  });

afterEach(() => {
  forgetDebateLookups();
  clock = 0;
});

describe('debatesAppRedirect', () => {
  it('sends a visible debate to the debates app, carrying the query over', async () => {
    const fetchEntity = vi.fn().mockResolvedValue(entity());
    await expect(go(fetchEntity, 'utm_source=x&utm_medium=share')).resolves.toBe(
      `https://debates.geobrowser.io/debate/${DEBATE_ID}?utm_source=x&utm_medium=share`
    );
    expect(fetchEntity).toHaveBeenCalledWith(DEBATE_ID, SPACE_ID, expect.any(AbortSignal));
  });

  it('keeps the page for ?stay=1, without asking the graph', async () => {
    const fetchEntity = vi.fn().mockResolvedValue(entity());
    await expect(go(fetchEntity, 'stay=1')).resolves.toBeNull();
    expect(fetchEntity).not.toHaveBeenCalled();
  });

  it('never asks the graph about an id that cannot be a debate’s', async () => {
    const fetchEntity = vi.fn().mockResolvedValue(entity());
    await expect(go(fetchEntity, '', OTHER_ID)).resolves.toBeNull();
    expect(fetchEntity).not.toHaveBeenCalled();
  });

  it('keeps the page for something that is not a debate, or a hidden one', async () => {
    await expect(go(vi.fn().mockResolvedValue(entity({ types: [{ id: 'x' }] })))).resolves.toBeNull();
    forgetDebateLookups();
    await expect(go(vi.fn().mockResolvedValue(null))).resolves.toBeNull();
    forgetDebateLookups();
    const hidden = entity({ values: [{ property: { id: HIDDEN_PROPERTY_ID }, value: 'true' }] });
    await expect(go(vi.fn().mockResolvedValue(hidden))).resolves.toBeNull();
  });

  // Review of #3110: Google sign-in returns to the page it started from, cross-site, with a code
  // that belongs to geobrowser.io.
  it('keeps a sign-in returning to the page, without asking the graph', async () => {
    const fetchEntity = vi.fn().mockResolvedValue(entity());
    await expect(go(fetchEntity, 'privy_oauth_code=abc&privy_oauth_state=x')).resolves.toBeNull();
    expect(fetchEntity).not.toHaveBeenCalled();
  });

  // Review of #3110: the reply email's Reply button (geo-notifications, `?modal=comments`) and a
  // calendar connect's return (`?modal=schedule&calendar=connected`) come back from outside.
  it('keeps links that open a geobrowser.io panel or return from a calendar connect', async () => {
    const fetchEntity = vi.fn().mockResolvedValue(entity());
    for (const query of ['modal=comments', 'modal=schedule&calendar=connected', 'calendar=error']) {
      await expect(go(fetchEntity, query)).resolves.toBeNull();
    }
    expect(fetchEntity).not.toHaveBeenCalled();
  });

  // Review of #3110: geobrowser.io counts an email's click and greets its reader as returning.
  it('keeps an email’s links on geobrowser.io', async () => {
    const fetchEntity = vi.fn().mockResolvedValue(entity());
    for (const query of ['ref_email=welcome', 'ref_send=abc', 'ref_link=watch']) {
      await expect(go(fetchEntity, query)).resolves.toBeNull();
    }
    expect(fetchEntity).not.toHaveBeenCalled();
  });

  // Review of #3110: `t` is on the raw recordings' clock; the debates app's `time` is on the
  // rendered video's, which an edited Open rounds render cuts. A timestamped link stays.
  it('keeps a timestamped link on geobrowser.io, whose player uses its clock', async () => {
    const fetchEntity = vi.fn().mockResolvedValue(entity());
    await expect(go(fetchEntity, 't=312&utm_source=x')).resolves.toBeNull();
    expect(fetchEntity).not.toHaveBeenCalled();
  });

  it('forgets an answer after a few minutes, so a debate hidden since stops redirecting', async () => {
    const fetchEntity = vi
      .fn()
      .mockResolvedValueOnce(entity())
      .mockResolvedValueOnce(entity({ values: [{ property: { id: HIDDEN_PROPERTY_ID }, value: 'true' }] }));
    await expect(go(fetchEntity)).resolves.not.toBeNull();
    clock = 4 * 60_000;
    await expect(go(fetchEntity)).resolves.not.toBeNull();
    clock = 6 * 60_000;
    await expect(go(fetchEntity)).resolves.toBeNull();
    expect(fetchEntity).toHaveBeenCalledTimes(2);
  });

  it('does not remember a debate that is not on the graph yet', async () => {
    const fetchEntity = vi.fn().mockResolvedValueOnce(null).mockResolvedValueOnce(entity());
    await expect(go(fetchEntity)).resolves.toBeNull();
    await expect(go(fetchEntity)).resolves.not.toBeNull();
  });

  it('remembers one answer whichever form the id takes', async () => {
    const fetchEntity = vi.fn().mockResolvedValue(entity());
    await go(fetchEntity, '', '01a1d0d9-4430-7570-8464-dc8bf6c812bd');
    await go(fetchEntity, '', DEBATE_ID);
    expect(fetchEntity).toHaveBeenCalledTimes(1);
  });

  it('remembers an answer, but not a failed lookup', async () => {
    const failing = vi.fn().mockRejectedValue(new Error('graph down'));
    await expect(go(failing)).resolves.toBeNull();
    const fetchEntity = vi.fn().mockResolvedValue(entity());
    await expect(go(fetchEntity)).resolves.not.toBeNull();
    await expect(go(fetchEntity)).resolves.not.toBeNull();
    expect(fetchEntity).toHaveBeenCalledTimes(1);
  });

  it('gives up on a slow graph and keeps the page', async () => {
    const slow = vi.fn(
      (_id: string, _space: string, signal: AbortSignal) =>
        new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(signal.reason)))
    );
    await expect(go(slow, '', DEBATE_ID, 5)).resolves.toBeNull();
  });
});

describe('the switch and the id check', () => {
  it('is on unless DEBATE_PAGE_REDIRECT=off', () => {
    expect(debatesAppRedirectEnabled({})).toBe(true);
    expect(debatesAppRedirectEnabled({ DEBATE_PAGE_REDIRECT: 'on' })).toBe(true);
    expect(debatesAppRedirectEnabled({ DEBATE_PAGE_REDIRECT: 'off' })).toBe(false);
    expect(debatesAppRedirectEnabled({ DEBATE_PAGE_REDIRECT: ' OFF ' })).toBe(false);
  });

  it('treats only version-7 UUIDs as possible debate ids', () => {
    expect(couldBeDebateId(DEBATE_ID)).toBe(true);
    expect(couldBeDebateId('01a1d0d9-4430-7570-8464-dc8bf6c812bd')).toBe(true);
    expect(couldBeDebateId(OTHER_ID)).toBe(false);
  });
});
