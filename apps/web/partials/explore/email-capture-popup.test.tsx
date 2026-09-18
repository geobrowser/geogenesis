import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

import * as React from 'react';

import { getDefaultStore } from 'jotai';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { isChatOpenAtom } from '~/core/state/chat-store';

import { ExploreEmailCapturePopup } from './email-capture-popup';
import { entitySidePanelAtom } from '~/atoms';

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
  usePrivySignIn: vi.fn(),
  useLoginWithEmailArgs: undefined as unknown,
}));

vi.mock('@geogenesis/auth', () => ({
  usePrivy: () => ({ ready: mocks.ready, authenticated: mocks.authenticated, isModalOpen: mocks.isModalOpen }),
  useLoginWithEmail: (args?: unknown) => {
    mocks.useGeoLoginWithEmail();
    mocks.useLoginWithEmailArgs = args;
    // Fresh identities per render, as a real hook returns. A stable `vi.fn()` here made an effect
    // keyed on these look like it ran once when it in fact re-runs on every render.
    return {
      sendCode: (args: { email: string }) => mocks.sendCode(args),
      loginWithCode: (args: { code: string }) => mocks.loginWithCode(args),
      state: mocks.otpState,
    };
  },
}));

vi.mock('~/core/hooks/use-privy-sign-in', () => ({
  usePrivySignIn: () => {
    mocks.usePrivySignIn();
    return mocks.openPrivyModal;
  },
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
  // A pending account attempt is session-scoped; left behind it resumes into the next test.
  window.sessionStorage.clear();
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
  mocks.usePrivySignIn.mockReset();
  mocks.useLoginWithEmailArgs = undefined;
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

  // The artwork is decoration: a screen reader walking into the card should reach the heading and
  // the form, not a run of entity names and relation tags from the illustration.
  it('hides the artwork from assistive technology', () => {
    render(<ExploreEmailCapturePopup />);
    scrollPastTrigger();

    const artwork = popup()?.querySelector('img')?.closest('[aria-hidden]');
    expect(artwork).not.toBeNull();
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
  // to one is a fix half-applied. The design's 15px leading sits under the 24px glyphs and only
  // works unwrapped; below 320px the sheet narrows and these wrap into each other.
  it('gives both headlines a leading that survives wrapping on a narrow card', async () => {
    const view = render(<ExploreEmailCapturePopup />);
    scrollPastTrigger();

    const heading = screen.getByText('Geo network launching soon!');
    expect(heading.className).toContain('max-[319px]:leading-[28px]');

    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'reader@example.com' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Subscribe' }));
    });
    view.rerender(<ExploreEmailCapturePopup />);

    expect(screen.getByText('You are on the list.').className).toContain('max-[319px]:leading-[28px]');
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
    it('uses the login hook only once an account is asked for', async () => {
      await subscribeSuccessfully();
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Create account' }));
      });

      expect(mocks.useGeoLoginWithEmail).toHaveBeenCalled();
    });

    // Privy's login hooks register on a shared emitter. One mounted on every Explore visit would be
    // registering callbacks beside the navbar's own login for every reader who never presses the
    // button that leads here, which is both waste and a plausible way to disturb that login.
    it('registers no Privy login callbacks until someone actually asks for an account', async () => {
      await subscribeSuccessfully();

      // The confirmation is on screen with the offer showing, and still nothing is registered.
      expect(screen.getByRole('button', { name: 'Create account' })).toBeInTheDocument();
      expect(mocks.useGeoLoginWithEmail).not.toHaveBeenCalled();
      // The fallback counts too: it is a second `useLogin` beside the navbar's own, and the
      // navbar's is the login button people actually press.
      expect(mocks.usePrivySignIn).not.toHaveBeenCalled();
    });

    // Mounting the step is what requests the code, so a re-render must not mail a second one and
    // silently retire the first.
    // The failure reported from the preview, and the one the mock above used to hide: a hook returns
    // new callback identities every render, so an effect keyed on them re-fires. Each re-fire
    // mailed another code, cleared the field mid-typing, and eventually tripped Privy's own limit —
    // whose rejection lands in the fallback and opens the dialog this exists to avoid.
    it('requests exactly one code, however often the card re-renders', async () => {
      const view = await subscribeSuccessfully();
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Create account' }));
      });

      mocks.otpState = { status: 'awaiting-code-input' };
      view.rerender(<ExploreEmailCapturePopup />);
      view.rerender(<ExploreEmailCapturePopup />);

      expect(mocks.sendCode).toHaveBeenCalledTimes(1);
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

    // The other half of the same bug, and the one that made the step unusable even when the modal
    // did not appear: the send cleared the field, so a re-fire wiped whatever had been typed.
    it('does not clear a code being typed when the card re-renders', async () => {
      const view = await subscribeSuccessfully();
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Create account' }));
      });
      mocks.otpState = { status: 'awaiting-code-input' };
      view.rerender(<ExploreEmailCapturePopup />);

      const field = () => screen.getByRole('textbox', { name: 'Verification code' }) as HTMLInputElement;
      fireEvent.change(field(), { target: { value: '1234' } });
      view.rerender(<ExploreEmailCapturePopup />);
      view.rerender(<ExploreEmailCapturePopup />);

      expect(field().value).toBe('1234');
    });

    // Never offered to the reader, but it is what StrictMode does to every effect in development,
    // and the dependency array alone does not survive it.
    // Under StrictMode React deliberately runs setup, cleanup, then setup again. `rerender` does
    // not do that -- it keeps the same instance -- so the previous version of this test claimed to
    // cover a double mount while never causing one, and passed with the guard removed.
    it('sends one code even when the mount effect is replayed', async () => {
      render(
        <React.StrictMode>
          <ExploreEmailCapturePopup />
        </React.StrictMode>
      );
      scrollPastTrigger();
      fireEvent.change(screen.getByRole('textbox'), { target: { value: 'reader@example.com' } });
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Subscribe' }));
      });
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Create account' }));
      });

      expect(mocks.sendCode).toHaveBeenCalledTimes(1);
    });

    // Mounting the step is what sends a code, and the overlay guard returns `null` for the whole
    // card — so an overlay opening and closing mid-sign-up used to remount the step, mail a second
    // code, and silently retire the one the reader was part-way through typing.
    it('keeps the code attempt alive when an overlay opens and closes', async () => {
      const view = await subscribeSuccessfully();
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Create account' }));
      });
      mocks.otpState = { status: 'awaiting-code-input' };
      view.rerender(<ExploreEmailCapturePopup />);

      fireEvent.change(screen.getByRole('textbox', { name: 'Verification code' }), { target: { value: '1234' } });
      expect(mocks.sendCode).toHaveBeenCalledTimes(1);

      // They open search, then close it.
      act(() => store.set(isChatOpenAtom, true));
      view.rerender(<ExploreEmailCapturePopup />);
      act(() => store.set(isChatOpenAtom, false));
      view.rerender(<ExploreEmailCapturePopup />);

      // No second code, and what they had typed is still there.
      expect(mocks.sendCode).toHaveBeenCalledTimes(1);
      expect((screen.getByRole('textbox', { name: 'Verification code' }) as HTMLInputElement).value).toBe('1234');
    });

    // It still has to get out of the way while the overlay is up — hidden, not merely behind it.
    it('yields the screen to the overlay without tearing the attempt down', async () => {
      const view = await subscribeSuccessfully();
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Create account' }));
      });

      act(() => store.set(isChatOpenAtom, true));
      view.rerender(<ExploreEmailCapturePopup />);

      // `hidden` takes it out of the layout, hit-testing and the accessibility tree, so querying by
      // role finds nothing even though the component is still mounted.
      expect(popup()).toBeNull();
      expect(mocks.sendCode).toHaveBeenCalledTimes(1);
    });

    // Pins the attribute rather than the behaviour, deliberately. The browser enforces `maxLength`
    // on raw input before `onChange` runs, so pasting "123 456" would be cut to "123 45" and only
    // then stripped, leaving five digits in a step that cannot be completed. jsdom cannot reproduce
    // that — `fireEvent.change` assigns `.value` directly and native truncation never happens — so
    // a behavioural test here would pass with the attribute restored. This one does not.
    it('sets no maxLength, which would truncate a pasted code before its spaces are stripped', async () => {
      const view = await subscribeSuccessfully();
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Create account' }));
      });
      mocks.otpState = { status: 'awaiting-code-input' };
      view.rerender(<ExploreEmailCapturePopup />);

      expect(screen.getByRole('textbox', { name: 'Verification code' })).not.toHaveAttribute('maxlength');
    });

    // `autoFocus` could not do this: the field renders enabled for one frame, takes focus, and is
    // immediately disabled by the send that starts on mount — which blurs it, with nothing putting
    // it back. The reader was left clicking into the field the step exists to put them in.
    it('focuses the code field once it is actually usable', async () => {
      const view = await subscribeSuccessfully();
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Create account' }));
      });

      mocks.otpState = { status: 'awaiting-code-input' };
      view.rerender(<ExploreEmailCapturePopup />);

      await waitFor(() =>
        expect(document.activeElement).toBe(screen.getByRole('textbox', { name: 'Verification code' }))
      );
    });

    // Reported in review: the dismissal is recorded at subscribe, and the `status === 'done'`
    // exception that keeps the card up is component state. A navigation destroys it, so a reader who
    // clicked a link while waiting for the code came back holding a valid code with nowhere to type
    // it and no way to ask for the field again.
    it('comes back into the code step after a navigation away', async () => {
      const view = await subscribeSuccessfully('reader@example.com');
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Create account' }));
      });
      expect(mocks.sendCode).toHaveBeenCalledTimes(1);

      // They follow a link. The popup unmounts with the page.
      view.unmount();
      mocks.sendCode.mockClear();
      mocks.otpState = { status: 'awaiting-code-input' };

      // Back on Explore, with the dismissal already recorded from the subscribe.
      render(<ExploreEmailCapturePopup />);

      expect(screen.getByRole('textbox', { name: 'Verification code' })).toBeInTheDocument();
      expect(screen.getByText('reader@example.com')).toBeInTheDocument();
    });

    it('does not come back once they have closed it', async () => {
      const view = await subscribeSuccessfully();
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Create account' }));
      });

      fireEvent.click(screen.getByRole('button', { name: 'Dismiss newsletter signup' }));
      view.unmount();

      render(<ExploreEmailCapturePopup />);
      scrollPastTrigger();

      expect(popup()).toBeNull();
    });

    // Nothing to resume into: the field would be offered for a code that no longer works.
    it('does not resume an attempt older than the code it was waiting for', async () => {
      const view = await subscribeSuccessfully();
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Create account' }));
      });
      view.unmount();

      const stale = JSON.parse(window.sessionStorage.getItem('exploreEmailCapturePendingSignup') ?? '{}');
      window.sessionStorage.setItem(
        'exploreEmailCapturePendingSignup',
        JSON.stringify({ ...stale, startedAt: Date.now() - 11 * 60 * 1000 })
      );

      render(<ExploreEmailCapturePopup />);
      scrollPastTrigger();

      expect(screen.queryByRole('textbox', { name: 'Verification code' })).toBeNull();
    });

    // Reports its own sign-in. Leaving it to the navbar looked tidy and was not: that button is
    // replaced by a loading skeleton whenever `isUserLoading` is true — which flips back mid-session
    // on a tab refocus — so a completion landing in that window was recorded by nobody. The navbar
    // arms its tracker now, so this one cannot double-count.
    it('reports the sign-in it started, attributed to this flow', async () => {
      await subscribeSuccessfully();
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Create account' }));
      });

      const args = mocks.useLoginWithEmailArgs as { onComplete?: (a: unknown) => void } | undefined;
      expect(typeof args?.onComplete).toBe('function');
    });

    // Both resend controls used to stay live while a verification was in flight, so pressing one
    // retired the very code being checked.
    it('will not send a new code while one is being verified', async () => {
      const view = await subscribeSuccessfully();
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Create account' }));
      });

      mocks.otpState = { status: 'submitting-code' };
      view.rerender(<ExploreEmailCapturePopup />);

      expect(screen.getByRole('button', { name: 'Send a new code' })).toBeDisabled();
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
