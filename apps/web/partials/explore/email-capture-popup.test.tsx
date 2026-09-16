import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ExploreEmailCapturePopup } from './email-capture-popup';

const mocks = vi.hoisted(() => ({
  user: null as unknown,
  isModalOpen: false,
  fetch: vi.fn(),
}));

vi.mock('@geogenesis/auth', () => ({
  usePrivy: () => ({ user: mocks.user, isModalOpen: mocks.isModalOpen }),
}));

// `ClientOnly` renders nothing until mounted, which is right in a browser and only noise here.
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
  mocks.user = null;
  mocks.isModalOpen = false;
  mocks.fetch.mockReset();
  mocks.fetch.mockResolvedValue({ json: async () => ({ result: 'subscribed' }) });
  vi.stubGlobal('fetch', mocks.fetch);
  window.scrollY = 0;
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const popup = () => screen.queryByRole('dialog', { name: 'Geo network launching soon' });

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
    mocks.user = { id: 'someone' };
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

    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
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
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));

    const Reloaded = await reload();
    window.scrollY = window.innerHeight * 5;
    render(<Reloaded />);

    expect(popup()).toBeNull();
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

    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));

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
