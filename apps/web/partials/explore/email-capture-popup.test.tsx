import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

import { getDefaultStore } from 'jotai';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { isChatOpenAtom } from '~/core/state/chat-store';

import { entitySidePanelAtom } from '~/atoms';

import { ExploreEmailCapturePopup } from './email-capture-popup';

const store = getDefaultStore();

const mocks = vi.hoisted(() => ({
  ready: true,
  authenticated: false,
  isModalOpen: false,
  isDebatesHubOpen: false,
  fetch: vi.fn(),
  sendCode: vi.fn(),
  loginWithCode: vi.fn(),
  otpState: { status: 'initial' } as { status: string; error?: Error | null },
  openPrivyModal: vi.fn(),
  prepareOnboarding: vi.fn(),
  useGeoLoginWithEmail: vi.fn(),
}));

vi.mock('@geogenesis/auth', () => ({
  usePrivy: () => ({ ready: mocks.ready, authenticated: mocks.authenticated, isModalOpen: mocks.isModalOpen }),
  useGeoLoginWithEmail: () => {
    mocks.useGeoLoginWithEmail();
    return { sendCode: mocks.sendCode, loginWithCode: mocks.loginWithCode, state: mocks.otpState };
  },
}));

vi.mock('~/core/hooks/use-privy-sign-in', () => ({
  usePrivySignIn: () => mocks.openPrivyModal,
}));

vi.mock('~/core/hooks/use-prepare-onboarding', () => ({
  usePrepareOnboarding: () => mocks.prepareOnboarding,
}));

// `ClientOnly` renders nothing until mounted, which is right in a browser and only noise here.
// The hub's own hook reaches for matchmaking state; only its open flag matters here.
vi.mock('~/core/debates/matchmaking/use-debates-hub', () => ({
  useDebatesHub: () => ({ isOpen: mocks.isDebatesHubOpen, open: vi.fn() }),
}));

vi.mock('~/design-system/client-only', () => ({
  ClientOnly: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

/** Puts the reader past the trigger and lets the listener run. */
function scrollPastTrigger() {
  act(() => {
    window.scrollY = window.innerHeight * 2;
    window.dispatchEvent(new Event('scroll'));
  });
}

beforeEach(() => {
  window.localStorage.clear();
  mocks.ready = true;
  mocks.authenticated = false;
  mocks.isModalOpen = false;
  mocks.isDebatesHubOpen = false;
  store.set(isChatOpenAtom, false);
  store.set(entitySidePanelAtom, null);
  mocks.sendCode.mockReset().mockResolvedValue(undefined);
  mocks.loginWithCode.mockReset().mockResolvedValue(undefined);
  mocks.openPrivyModal.mockReset();
  mocks.prepareOnboarding.mockReset();
  mocks.useGeoLoginWithEmail.mockReset();
  mocks.otpState = { status: 'initial' };
  mocks.fetch.mockReset();
  mocks.fetch.mockResolvedValue({ json: async () => ({ result: 'subscribed' }) });
  vi.stubGlobal('fetch', mocks.fetch);
  window.scrollY = 0;
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const popup = () => screen.queryByRole('region', { name: 'Geo network launching soon' });

/** Renders, scrolls past the trigger, and subscribes — landing on the success state. */
async function subscribeSuccessfully(email = 'reader@example.com') {
  const view = render(<ExploreEmailCapturePopup />);
  scrollPastTrigger();
  fireEvent.change(screen.getByRole('textbox'), { target: { value: email } });
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Subscribe' }));
  });
  return view;
}

describe('ExploreEmailCapturePopup', () => {
  it('stays away until the reader has scrolled', () => {
    render(<ExploreEmailCapturePopup />);

    expect(popup()).toBeNull();

    scrollPastTrigger();

    expect(popup()).toBeInTheDocument();
  });

  // The whole point of the ticket: a reader who already has an account is not who the list is for.
  // Reported from the browser: the popup and the chat launcher share the bottom-right corner, and
  // at `z-100` the assistant's button drew over the "Remind me" button and took the click. A
  // stacking bug is invisible to every other test here, so this reads the number rather than
  // trusting the comment beside it.
  it('stacks above the chat launcher, which shares its corner', () => {
    render(<ExploreEmailCapturePopup />);
    scrollPastTrigger();

    const zIndex = Number(popup()?.className.match(/(?:^|\s)z-(\d+)(?:\s|$)/)?.[1]);
    // `partials/chat/chat-widget.tsx` pins the launcher at `z-1100`.
    expect(zIndex).toBeGreaterThan(1100);
    // And below the slide-up/status/toast layers, which start at 10000 in `styles.css` — a
    // dismissible prompt must not outrank a toast.
    expect(zIndex).toBeLessThan(10000);
  });

  it('never appears for someone signed in, however far they scroll', () => {
    mocks.authenticated = true;
    render(<ExploreEmailCapturePopup />);

    scrollPastTrigger();

    expect(popup()).toBeNull();
  });

  // A popup that returns on the next load is worse than no popup, and a remount does not prove it
  // does not: `dismissedNoticesAtom` lives at module scope, so an unmount/remount pair holds the
  // dismissal in memory whether or not it ever reached storage. These go through a real reload —
  // `resetModules` throws away the module graph and with it jotai's store, leaving localStorage as
  // the only thing that crosses — and check the write itself, since that is the half that has to
  // survive. The id is the storage contract; spelled out rather than imported so that renaming the
  // constant cannot quietly strand every reader who has already dismissed this.
  async function reload() {
    cleanup();
    vi.resetModules();
    return (await import('./email-capture-popup')).ExploreEmailCapturePopup;
  }

  it('writes the dismissal to storage and stays away on the next load', async () => {
    render(<ExploreEmailCapturePopup />);
    scrollPastTrigger();

    fireEvent.click(screen.getByRole('button', { name: 'Dismiss newsletter signup' }));
    expect(popup()).toBeNull();
    expect(window.localStorage.getItem('dismissedNotices')).toContain('exploreEmailCapture');

    const Reloaded = await reload();
    render(<Reloaded />);
    scrollPastTrigger();

    expect(popup()).toBeNull();
  });

  // Subscribing has to stick for the same reason, by a different route: it records the dismissal
  // without anyone pressing Dismiss, so nothing above covers it. Asking someone to subscribe again
  // on the next visit is the worst version of this popup.
  it('writes the dismissal when someone subscribes, and stays away on the next load', async () => {
    render(<ExploreEmailCapturePopup />);
    scrollPastTrigger();

    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'reader@example.com' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Subscribe' }));
    });
    expect(window.localStorage.getItem('dismissedNotices')).toContain('exploreEmailCapture');

    const Reloaded = await reload();
    render(<Reloaded />);
    scrollPastTrigger();

    expect(popup()).toBeNull();
  });

  // The one case where a stale read would actually show through. Storage is read on mount rather
  // than at atom creation, and the scroll gate is also checked on mount, so a reader returning to
  // a restored scroll position past the trigger is the one arrival where "dismissed" could still
  // be `[]` on the frame the gate opens. It resolves in the same commit today; this is here to say
  // so if that ever stops being true.
  it('stays away on a reload that restores a scroll position past the trigger', async () => {
    render(<ExploreEmailCapturePopup />);
    scrollPastTrigger();
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss newsletter signup' }));

    const Reloaded = await reload();
    window.scrollY = window.innerHeight * 5;
    render(<Reloaded />);

    expect(popup()).toBeNull();
  });

  // Privy reports `authenticated: false` while it is still restoring a session from storage, so
  // without the `ready` gate a signed-in reader is indistinguishable from an anonymous one for as
  // long as that takes — and on a restored scroll position the popup renders immediately, so they
  // are shown a signup card and can start typing into it before it vanishes under them.
  it('waits for Privy to finish restoring before deciding anyone is logged out', () => {
    mocks.ready = false;

    render(<ExploreEmailCapturePopup />);
    scrollPastTrigger();

    expect(popup()).toBeNull();
  });

  it('does not appear at all for a session that restores into a signed-in reader', () => {
    mocks.ready = false;
    const view = render(<ExploreEmailCapturePopup />);
    scrollPastTrigger();

    // Privy resolves: the reader was signed in the whole time.
    mocks.ready = true;
    mocks.authenticated = true;
    view.rerender(<ExploreEmailCapturePopup />);

    expect(popup()).toBeNull();
  });

  it('appears once Privy resolves to nobody', () => {
    mocks.ready = false;
    const view = render(<ExploreEmailCapturePopup />);
    scrollPastTrigger();
    expect(popup()).toBeNull();

    mocks.ready = true;
    view.rerender(<ExploreEmailCapturePopup />);

    expect(popup()).toBeInTheDocument();
  });

  // The chat panel is not merely another surface: it is this corner at this stacking order
  // (`chat-panel.tsx` is `z-1100` at the same `fixed right-4 bottom-…`), so one above it covers the
  // panel's own controls and takes their clicks rather than sitting beside them.
  it('waits while the chat panel is open, then returns', () => {
    store.set(isChatOpenAtom, true);
    const view = render(<ExploreEmailCapturePopup />);
    scrollPastTrigger();

    expect(popup()).toBeNull();

    act(() => store.set(isChatOpenAtom, false));
    view.rerender(<ExploreEmailCapturePopup />);

    expect(popup()).toBeInTheDocument();
  });

  // The rate-limit windows are 10 minutes and an hour, so naming a shorter wait invites a retry
  // that is certain to be refused the same way.
  it('does not promise a retry window the limiter will not honour', async () => {
    mocks.fetch.mockResolvedValue({ json: async () => ({ result: 'rate-limited' }) });
    render(<ExploreEmailCapturePopup />);
    scrollPastTrigger();

    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'reader@example.com' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Subscribe' }));
    });

    const alert = await screen.findByRole('alert');
    expect(alert).toBeInTheDocument();
    expect(alert.textContent).not.toMatch(/\bminute\b|\bsecond\b|\bmoment\b/i);
  });

  // Nothing here asked to be opened, so a `dialog` would owe its reader a focus move that would
  // interrupt them mid-sentence — and a `dialog` that never moves focus promises behaviour it does
  // not implement. A named landmark is reachable without taking anything away.
  it('is a named landmark rather than a dialog that never takes focus', () => {
    render(<ExploreEmailCapturePopup />);
    scrollPastTrigger();

    expect(screen.queryByRole('dialog')).toBeNull();
    expect(popup()).toBeInTheDocument();
    // Reading focus did not move; the reader is still wherever they were.
    expect(document.activeElement).toBe(document.body);
  });

  it('closes on Escape from inside the card, and records the dismissal', async () => {
    render(<ExploreEmailCapturePopup />);
    scrollPastTrigger();

    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Escape' });

    expect(popup()).toBeNull();
    expect(window.localStorage.getItem('dismissedNotices')).toContain('exploreEmailCapture');
  });

  // Submitting removes the button that had focus, so without a live region a reader not watching
  // this corner gets silence exactly where the confirmation is.
  it('announces the confirmation, which replaces the control that had focus', async () => {
    render(<ExploreEmailCapturePopup />);
    scrollPastTrigger();

    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'reader@example.com' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Subscribe' }));
    });

    const confirmation = await screen.findByRole('status');
    expect(confirmation.textContent).toContain('You are on the list.');
  });

  // The same gap the route had on its own call, on this side of the wire: a request accepted and
  // never answered would leave the button disabled and the form stuck with no way forward.
  it('bounds its own request rather than sitting in submitting forever', async () => {
    let signal: AbortSignal | undefined;
    mocks.fetch.mockImplementation((_url: string, init: { signal?: AbortSignal }) => {
      signal = init.signal;
      return Promise.reject(Object.assign(new Error('The operation was aborted'), { name: 'TimeoutError' }));
    });

    render(<ExploreEmailCapturePopup />);
    scrollPastTrigger();
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'reader@example.com' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Subscribe' }));
    });

    expect(signal).toBeInstanceOf(AbortSignal);
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    // Back to a usable form rather than a disabled button.
    expect(screen.getByRole('button', { name: 'Subscribe' })).not.toBeDisabled();
  });

  // Below 382px the card stops being 350 wide and `object-cover` begins cropping. Centred, it crops
  // evenly and the artwork's baked-in close glyph drifts left while the real button stays at
  // `right-4` — 31px apart on a 320px viewport, which uncovers the glyph the chip exists to hide.
  // Anchored right, both are measured from the same edge at every width.
  it('anchors the artwork to the right, where the close button is measured from', () => {
    render(<ExploreEmailCapturePopup />);
    scrollPastTrigger();

    const artwork = popup()?.querySelector('img');
    expect(artwork).not.toBeNull();
    expect(artwork?.className).toContain('object-right');
  });

  // Opened from the welcome banner on this very page, so a logged-out reader is one click away.
  // Desktop is `fixed top-11 right-0 bottom-0 z-[200]` and this card sits inside that column;
  // mobile is `fixed inset-0`, which this would visually escape.
  it('waits while the debates hub is open, then returns', () => {
    mocks.isDebatesHubOpen = true;
    const view = render(<ExploreEmailCapturePopup />);
    scrollPastTrigger();

    expect(popup()).toBeNull();

    mocks.isDebatesHubOpen = false;
    view.rerender(<ExploreEmailCapturePopup />);

    expect(popup()).toBeInTheDocument();
  });

  // Not in the review, but the same mistake and the likeliest of the four to be met: every card
  // title on this page opens it (`titleOpensSidePanel`), at `fixed inset-0 z-[200]`.
  it('waits while the entity side panel is open, then returns', () => {
    store.set(entitySidePanelAtom, { entityId: 'some-entity', spaceId: 'some-space' } as never);
    const view = render(<ExploreEmailCapturePopup />);
    scrollPastTrigger();

    expect(popup()).toBeNull();

    act(() => store.set(entitySidePanelAtom, null));
    view.rerender(<ExploreEmailCapturePopup />);

    expect(popup()).toBeInTheDocument();
  });

  // The success state is exempt from the *dismissal* it just recorded, and from nothing else.
  // Bypassing the whole eligibility check left a logged-out-only card on screen for someone who
  // had signed in while reading their own confirmation.
  it('disappears if the reader signs in while the confirmation is open', async () => {
    const view = render(<ExploreEmailCapturePopup />);
    scrollPastTrigger();

    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'reader@example.com' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Subscribe' }));
    });
    expect(await screen.findByRole('status')).toBeInTheDocument();

    // They sign in without closing the card.
    mocks.authenticated = true;
    view.rerender(<ExploreEmailCapturePopup />);

    expect(popup()).toBeNull();
  });

  // The other half, so the fix above does not simply delete the confirmation for everyone else.
  it('keeps the confirmation up for a reader who stays logged out', async () => {
    const view = render(<ExploreEmailCapturePopup />);
    scrollPastTrigger();

    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'reader@example.com' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Subscribe' }));
    });

    view.rerender(<ExploreEmailCapturePopup />);

    expect(popup()).toBeInTheDocument();
    expect(screen.getByRole('status').textContent).toContain('You are on the list.');
  });

  // The general case, and the reason this guard stopped being a list of names. The sign-in prompt
  // (`partials/sign-in-prompt/sign-in-prompt.tsx`) and global search (`partials/search/dialog.tsx`)
  // are both Radix underneath, which renders `role="dialog"` with `data-state` and no `aria-modal`
  // — so neither is reachable by naming it here, and both are covered by asking the document.
  it('waits while any modal dialog is open, including ones it does not know about', async () => {
    const view = render(<ExploreEmailCapturePopup />);
    scrollPastTrigger();
    expect(popup()).toBeInTheDocument();

    const dialog = document.createElement('div');
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('data-state', 'open');
    await act(async () => {
      document.body.appendChild(dialog);
    });
    view.rerender(<ExploreEmailCapturePopup />);
    await waitFor(() => expect(popup()).toBeNull());

    await act(async () => {
      dialog.remove();
    });
    view.rerender(<ExploreEmailCapturePopup />);
    await waitFor(() => expect(popup()).toBeInTheDocument());
  });

  // Both headlines, not just the one that was reported: they share the styling, so a fix applied
  // to one is a fix half-applied. The design's 17px leading sits under the 28px glyphs and only
  // works unwrapped; below 382px the card narrows and these wrap into each other.
  it('gives both headlines a leading that survives wrapping on a narrow card', async () => {
    const view = render(<ExploreEmailCapturePopup />);
    scrollPastTrigger();

    const heading = screen.getByText('Geo Network launching soon!');
    expect(heading.className).toContain('max-[382px]:leading-[30px]');

    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'reader@example.com' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Subscribe' }));
    });
    view.rerender(<ExploreEmailCapturePopup />);

    expect(screen.getByText('You are on the list.').className).toContain('max-[382px]:leading-[30px]');
  });

  // The observer covers the whole body on a page holding an infinite feed, so leaving it running
  // after the card can no longer appear means a document scan per appended card, to answer a
  // question with no consequence.
  it('stops watching for modals once it has been dismissed', async () => {
    const disconnect = vi.spyOn(MutationObserver.prototype, 'disconnect');
    render(<ExploreEmailCapturePopup />);
    scrollPastTrigger();

    const before = disconnect.mock.calls.length;
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Dismiss newsletter signup' }));
    });

    expect(disconnect.mock.calls.length).toBeGreaterThan(before);
    disconnect.mockRestore();
  });

  describe('creating an account from the confirmation', () => {
    it('offers the account and a skip, rather than ending at the confirmation', async () => {
      await subscribeSuccessfully();

      expect(screen.getByRole('button', { name: 'Create account' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Skip' })).toBeInTheDocument();
    });

    // The whole point of the ticket: the address is already in hand, so asking for it again is the
    // one step worth removing. Privy's modal never opens.
    it('requests a code for the address they just subscribed with, without asking again', async () => {
      // Deliberately padded: the field's raw value is not what was subscribed, and Privy will not
      // take an address with spaces around it. Sending the field verbatim passes a test written
      // with tidy input and fails a real person who typed a trailing space.
      await subscribeSuccessfully('  Reader@Example.com  ');

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Create account' }));
      });

      expect(mocks.sendCode).toHaveBeenCalledWith({ email: 'Reader@Example.com' });
      expect(mocks.openPrivyModal).not.toHaveBeenCalled();
      // No second email field anywhere in the card.
      expect(screen.queryByRole('textbox', { name: 'Email address' })).toBeNull();
      expect(screen.getByRole('textbox', { name: 'Verification code' })).toBeInTheDocument();
    });

    // Reported from the browser: the code verified, the session existed, and then nothing — no
    // wallet, no onboarding, a page carrying on as though nobody had signed in. The cause was
    // reaching for Privy's raw `useLoginWithEmail`, which fires its own callbacks and so skips the
    // `setActiveWallet` that `useGeoLogin` performs. Without a wallet in wagmi's context
    // `useWalletClient` is empty, `useSmartAccount` resolves no address, and `usePersonalSpaceId`
    // never runs the query whose result decides a new account needs onboarding.
    //
    // The wrapper lives in `packages/auth`, which has no test harness, so this guards the call
    // site: swapping back to the raw hook leaves this spy uncalled and the import undefined.
    it('logs in through the wrapper that puts the wallet into wagmi, not the raw Privy hook', async () => {
      await subscribeSuccessfully();

      expect(mocks.useGeoLoginWithEmail).toHaveBeenCalled();
    });

    // Onboarding's step and field atoms are persisted, so a run abandoned in this browser is still
    // sitting there. Without this a new account resumes a stranger's half-filled profile and
    // finishes on whichever page it was abandoned on.
    it('clears any half-finished onboarding before starting the account', async () => {
      await subscribeSuccessfully();

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Create account' }));
      });

      expect(mocks.prepareOnboarding).toHaveBeenCalled();
    });

    it('asks in the confirmation copy, using the address already given', async () => {
      await subscribeSuccessfully();

      expect(
        screen.getByText('While we are here, do you want to create an account with the same email address?')
      ).toBeInTheDocument();
    });

    it('skip does what dismissing always did, and does not ask Privy for anything', async () => {
      await subscribeSuccessfully();

      fireEvent.click(screen.getByRole('button', { name: 'Skip' }));

      expect(popup()).toBeNull();
      expect(mocks.sendCode).not.toHaveBeenCalled();
      expect(window.localStorage.getItem('dismissedNotices')).toContain('exploreEmailCapture');
    });

    it('submits the code and lets the session take over', async () => {
      const view = await subscribeSuccessfully();
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Create account' }));
      });

      mocks.otpState = { status: 'awaiting-code-input' };
      view.rerender(<ExploreEmailCapturePopup />);
      fireEvent.change(screen.getByRole('textbox', { name: 'Verification code' }), { target: { value: '123456' } });
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
      });

      expect(mocks.loginWithCode).toHaveBeenCalledWith({ code: '123456' });
    });

    // Privy sends six digits and nothing else, so anything pasted around them is noise rather than
    // a reason to reject what someone pasted out of their mail client.
    it('keeps only the digits, up to the length of a code', async () => {
      const view = await subscribeSuccessfully();
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Create account' }));
      });
      mocks.otpState = { status: 'awaiting-code-input' };
      view.rerender(<ExploreEmailCapturePopup />);

      const field = screen.getByRole('textbox', { name: 'Verification code' }) as HTMLInputElement;
      fireEvent.change(field, { target: { value: ' 12a3 b4c5 6789 ' } });

      expect(field.value).toBe('123456');
    });

    it('will not submit a code that is not the right length', async () => {
      const view = await subscribeSuccessfully();
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Create account' }));
      });
      mocks.otpState = { status: 'awaiting-code-input' };
      view.rerender(<ExploreEmailCapturePopup />);

      fireEvent.change(screen.getByRole('textbox', { name: 'Verification code' }), { target: { value: '123' } });

      expect(screen.getByRole('button', { name: 'Continue' })).toBeDisabled();
    });

    it('says so when the code is refused, and offers a new one', async () => {
      const view = await subscribeSuccessfully();
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Create account' }));
      });

      mocks.otpState = { status: 'error', error: new Error('bad code') };
      view.rerender(<ExploreEmailCapturePopup />);

      expect(screen.getByRole('alert').textContent).toContain('That code did not work');

      mocks.sendCode.mockClear();
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Send a new one' }));
      });
      expect(mocks.sendCode).toHaveBeenCalledTimes(1);
    });

    // Privy retires a code after five wrong attempts, and mail simply fails to arrive sometimes.
    // Neither of those is an error state, so the way out cannot live only inside one.
    it('can request a new code without having failed first', async () => {
      const view = await subscribeSuccessfully();
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Create account' }));
      });
      mocks.otpState = { status: 'awaiting-code-input' };
      view.rerender(<ExploreEmailCapturePopup />);

      mocks.sendCode.mockClear();
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Send a new code' }));
      });

      expect(mocks.sendCode).toHaveBeenCalledTimes(1);
    });

    // Captcha, an outage, an address Privy will not take. Signing up is the point; not retyping an
    // email is a convenience, and it must not become the reason nobody can sign up at all.
    it('falls back to the normal sign-in dialog when the shortcut cannot start', async () => {
      mocks.sendCode.mockRejectedValue(new Error('captcha required'));
      await subscribeSuccessfully();

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Create account' }));
      });

      expect(mocks.openPrivyModal).toHaveBeenCalledTimes(1);
      expect(popup()).toBeNull();
    });
  });

  // Privy's modal is a sign-in the reader actively started; stacking on it is the worse
  // interruption. It waits rather than competing, and comes back when they close it.
  it('waits while the sign-in modal is open, then returns', () => {
    mocks.isModalOpen = true;
    const view = render(<ExploreEmailCapturePopup />);
    scrollPastTrigger();

    expect(popup()).toBeNull();

    mocks.isModalOpen = false;
    view.rerender(<ExploreEmailCapturePopup />);

    expect(popup()).toBeInTheDocument();
  });

  it('thanks the reader and does not ask again once they subscribe', async () => {
    const view = render(<ExploreEmailCapturePopup />);
    scrollPastTrigger();

    fireEvent.change(screen.getByLabelText('Email address'), { target: { value: 'preston@geobrowser.io' } });
    fireEvent.click(screen.getByRole('button', { name: 'Subscribe' }));

    expect(await screen.findByText('You are on the list.')).toBeInTheDocument();

    // Having joined is the strongest reason not to be asked again.
    view.unmount();
    render(<ExploreEmailCapturePopup />);
    scrollPastTrigger();
    expect(popup()).toBeNull();
  });

  // Reported from the browser: after subscribing, the X did nothing. Subscribing records the
  // dismissal so the popup does not return next visit, and the close button used to call that same
  // function — which by then was a no-op, because the id was already stored. So nothing changed and
  // the card stayed up with no way to shift it.
  it('closes from the success state, where the dismissal is already recorded', async () => {
    render(<ExploreEmailCapturePopup />);
    scrollPastTrigger();

    fireEvent.change(screen.getByLabelText('Email address'), { target: { value: 'preston@geobrowser.io' } });
    fireEvent.click(screen.getByRole('button', { name: 'Subscribe' }));
    expect(await screen.findByText('You are on the list.')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Dismiss newsletter signup' }));

    expect(popup()).toBeNull();
  });

  it('says what went wrong without sending an address it can see is not one', async () => {
    render(<ExploreEmailCapturePopup />);
    scrollPastTrigger();

    fireEvent.change(screen.getByLabelText('Email address'), { target: { value: 'preston' } });
    fireEvent.click(screen.getByRole('button', { name: 'Subscribe' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('does not look like an email address');
    expect(mocks.fetch).not.toHaveBeenCalled();
    // And what they typed is still there to fix, rather than cleared out from under them.
    expect(screen.getByLabelText('Email address')).toHaveValue('preston');
  });

  it('reports a refusal from the server rather than claiming success', async () => {
    mocks.fetch.mockResolvedValue({ json: async () => ({ result: 'rate-limited' }) });
    render(<ExploreEmailCapturePopup />);
    scrollPastTrigger();

    fireEvent.change(screen.getByLabelText('Email address'), { target: { value: 'preston@geobrowser.io' } });
    fireEvent.click(screen.getByRole('button', { name: 'Subscribe' }));

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Too many tries'));
    expect(screen.queryByText('You are on the list.')).toBeNull();
  });

  it('survives the request failing outright', async () => {
    mocks.fetch.mockRejectedValue(new Error('offline'));
    render(<ExploreEmailCapturePopup />);
    scrollPastTrigger();

    fireEvent.change(screen.getByLabelText('Email address'), { target: { value: 'preston@geobrowser.io' } });
    fireEvent.click(screen.getByRole('button', { name: 'Subscribe' }));

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Something went wrong'));
  });
});
