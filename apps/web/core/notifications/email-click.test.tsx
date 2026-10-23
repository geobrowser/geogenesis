import { act, cleanup, render } from '@testing-library/react';

import * as React from 'react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  session: false,
  report: vi.fn(),
}));

vi.mock('~/core/wallet/privy-session', () => ({
  hasPersistedPrivySession: () => mocks.session,
}));
vi.mock('./api', async importOriginal => ({
  ...(await importOriginal<typeof import('./api')>()),
  geoNotificationsApiUrl: () => 'https://n.example',
  reportEmailClick: (...args: unknown[]) => mocks.report(...args),
}));

const { EmailClickReporter } = await import('./email-click');
const { NotificationsRequestError } = await import('./api');

const SEND = '3b0c2c8e-9a51-4d7e-8f43-2f1c6a0d9e11';

let visibility: DocumentVisibilityState = 'visible';

function land(search: string) {
  window.history.replaceState(null, '', `/space/s/d${search}`);
}

function becomeVisible() {
  visibility = 'visible';
  act(() => {
    document.dispatchEvent(new Event('visibilitychange'));
  });
}

beforeEach(() => {
  window.sessionStorage.clear();
  visibility = 'visible';
  vi.spyOn(document, 'visibilityState', 'get').mockImplementation(() => visibility);
  mocks.session = false;
  mocks.report = vi.fn(async () => ({ outcome: 'counted' }));
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  land('');
});

describe('EmailClickReporter', () => {
  it('reports the landing from an email link once the page is on screen, signed out', () => {
    land(`?ref_email=digest&ref_send=${SEND}&ref_link=claim`);
    render(<EmailClickReporter />);
    expect(mocks.report).toHaveBeenCalledTimes(1);
    expect(mocks.report).toHaveBeenCalledWith('https://n.example', { send_id: SEND, link: 'claim', signed_in: false });
  });

  it('says when the browser holds a Privy session', () => {
    mocks.session = true;
    land(`?ref_send=${SEND}`);
    render(<EmailClickReporter />);
    expect(mocks.report).toHaveBeenCalledWith('https://n.example', { send_id: SEND, link: null, signed_in: true });
  });

  it('waits for a tab opened in the background to be looked at', () => {
    visibility = 'hidden';
    land(`?ref_send=${SEND}&ref_link=main`);
    render(<EmailClickReporter />);
    expect(mocks.report).not.toHaveBeenCalled();
    becomeVisible();
    becomeVisible();
    expect(mocks.report).toHaveBeenCalledTimes(1);
  });

  it('takes the click off the address bar as the report goes out, never when it answers', async () => {
    let answer: (value: unknown) => void = () => {};
    mocks.report = vi.fn(() => new Promise(resolve => (answer = resolve)));
    const replace = vi.spyOn(window.history, 'replaceState');
    land(`?ref_email=digest&ref_send=${SEND}&ref_link=main&utm_source=x#top`);
    replace.mockClear();
    render(<EmailClickReporter />);
    // Cleared before any answer, keeping the other params and the hash.
    expect(window.location.search).toBe('?ref_email=digest&utm_source=x');
    expect(window.location.hash).toBe('#top');
    expect(replace).toHaveBeenCalledTimes(1);
    // The answer arriving later (a navigation may be under way by then) touches history no more.
    await act(async () => answer({ outcome: 'counted' }));
    expect(replace).toHaveBeenCalledTimes(1);
    cleanup();
    render(<EmailClickReporter />);
    expect(mocks.report).toHaveBeenCalledTimes(1);
  });

  it('reports once per mount even when its effect runs twice', () => {
    land(`?ref_send=${SEND}`);
    render(
      <React.StrictMode>
        <EmailClickReporter />
      </React.StrictMode>
    );
    expect(mocks.report).toHaveBeenCalledTimes(1);
  });

  it('does nothing for a browser driven by automation, or a page not from an email', () => {
    // jsdom has no `navigator.webdriver`; a real automated browser sets it.
    Object.defineProperty(navigator, 'webdriver', { configurable: true, value: true });
    land(`?ref_send=${SEND}`);
    render(<EmailClickReporter />);
    cleanup();
    Reflect.deleteProperty(navigator, 'webdriver');
    land('?ref_email=digest');
    render(<EmailClickReporter />);
    expect(mocks.report).not.toHaveBeenCalled();
  });

  it("tries a failed report again on the next load, from the tab's session", async () => {
    mocks.report = vi.fn(async () => {
      throw new Error('offline');
    });
    land(`?ref_send=${SEND}&ref_link=claim_0`);
    render(<EmailClickReporter />);
    await act(async () => {});
    expect(window.location.search).toBe('');
    cleanup();
    mocks.report = vi.fn(async () => ({ outcome: 'counted' }));
    render(<EmailClickReporter />);
    await act(async () => {});
    expect(mocks.report).toHaveBeenCalledWith('https://n.example', {
      send_id: SEND,
      link: 'claim_0',
      signed_in: false,
    });
    // Answered now: nothing left to retry.
    cleanup();
    render(<EmailClickReporter />);
    expect(mocks.report).toHaveBeenCalledTimes(1);
  });

  it('does not retry a send the service does not know', async () => {
    mocks.report = vi.fn(async () => {
      throw new NotificationsRequestError('unknown send', 404);
    });
    land(`?ref_send=${SEND}`);
    render(<EmailClickReporter />);
    await act(async () => {});
    cleanup();
    render(<EmailClickReporter />);
    expect(mocks.report).toHaveBeenCalledTimes(1);
  });

  it('still reports once, and clears the URL, with session storage blocked', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    land(`?ref_send=${SEND}`);
    render(<EmailClickReporter />);
    expect(mocks.report).toHaveBeenCalledTimes(1);
    expect(window.location.search).toBe('');
  });

  it('reports once however often the tab is shown', () => {
    visibility = 'hidden';
    land(`?ref_send=${SEND}`);
    render(<EmailClickReporter />);
    becomeVisible();
    visibility = 'hidden';
    becomeVisible();
    expect(mocks.report).toHaveBeenCalledTimes(1);
  });
});
