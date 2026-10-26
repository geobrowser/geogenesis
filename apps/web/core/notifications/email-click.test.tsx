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
const OTHER = '7d1e2f30-4a5b-4c6d-8e9f-0a1b2c3d4e5f';

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

  // Rewriting history fights Next's router (it breaks Back before Next patches history, and discards a
  // navigation in flight after), so the URL is left exactly as it landed.
  it('never touches history: the URL stays as it landed', async () => {
    const replace = vi.spyOn(window.history, 'replaceState');
    const push = vi.spyOn(window.history, 'pushState');
    land(`?ref_email=digest&ref_send=${SEND}&ref_link=main#top`);
    replace.mockClear();
    render(<EmailClickReporter />);
    await act(async () => {});
    expect(replace).not.toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();
    expect(window.location.search).toBe(`?ref_email=digest&ref_send=${SEND}&ref_link=main`);
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

  it('tries a failed report again on a later load in the tab, without the params', async () => {
    mocks.report = vi.fn(async () => {
      throw new Error('offline');
    });
    land(`?ref_send=${SEND}&ref_link=claim_0`);
    render(<EmailClickReporter />);
    await act(async () => {});
    cleanup();
    land('');
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
    land('');
    render(<EmailClickReporter />);
    expect(mocks.report).toHaveBeenCalledTimes(1);
  });

  it('keeps a pending click when the service fails, and the signed-in state it was first reported with', async () => {
    mocks.report = vi.fn(async () => {
      throw new NotificationsRequestError('down', 500);
    });
    land(`?ref_send=${SEND}`);
    render(<EmailClickReporter />);
    await act(async () => {});
    cleanup();
    // They log in on that page; the retry still says how they arrived.
    mocks.session = true;
    mocks.report = vi.fn(async () => ({ outcome: 'counted' }));
    land('');
    render(<EmailClickReporter />);
    await act(async () => {});
    expect(mocks.report).toHaveBeenCalledWith('https://n.example', { send_id: SEND, link: null, signed_in: false });
  });

  it('reports a pending click and a second email opened in the same tab, both', async () => {
    mocks.report = vi.fn(async () => {
      throw new Error('offline');
    });
    land(`?ref_send=${SEND}&ref_link=main`);
    render(<EmailClickReporter />);
    await act(async () => {});
    cleanup();
    mocks.report = vi.fn(async () => ({ outcome: 'counted' }));
    land(`?ref_send=${OTHER}&ref_link=claim_0`);
    render(<EmailClickReporter />);
    await act(async () => {});
    expect(mocks.report.mock.calls.map(([, click]) => click)).toEqual([
      { send_id: SEND, link: 'main', signed_in: false },
      { send_id: OTHER, link: 'claim_0', signed_in: false },
    ]);
    // Both answered: nothing left pending.
    cleanup();
    land('');
    render(<EmailClickReporter />);
    expect(mocks.report).toHaveBeenCalledTimes(2);
  });

  it('still reports once with session storage blocked', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    land(`?ref_send=${SEND}`);
    render(<EmailClickReporter />);
    expect(mocks.report).toHaveBeenCalledTimes(1);
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
