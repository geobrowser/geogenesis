'use client';

import { usePrivy } from '@geogenesis/auth';

import * as React from 'react';

import cx from 'classnames';
import { useAtom } from 'jotai';

import { type NewsletterSubscribeResult, isLikelyEmail } from '~/core/newsletter/subscribe-result';

import { ClientOnly } from '~/design-system/client-only';
import { CloseSmall } from '~/design-system/icons/close-small';
import { Text } from '~/design-system/text';

import { dismissedNoticesAtom } from '~/atoms';

/**
 * Persisted alongside the other one-time notices, which is what makes "dismissed" mean dismissed
 * rather than dismissed-until-reload. A popup that returns on every page load is worse than no
 * popup, and the same storage the welcome banner uses already answers that.
 */
const EMAIL_CAPTURE_ID = 'exploreEmailCapture';

/**
 * How far down the reader has to be before they are asked.
 *
 * Two viewport heights, not a pixel count: the feed is an infinite list whose length says nothing,
 * and a fixed pixel figure means something different on a laptop and a phone. Two screens is far
 * enough that they have scrolled past the fold deliberately and seen a dozen claims — which is the
 * point, since there is nothing to subscribe *for* until they have seen what this place publishes.
 */
const SCROLL_TRIGGER_VIEWPORTS = 2;

type Status = 'idle' | 'submitting' | 'done' | NewsletterSubscribeResult;

/**
 * Asks a logged-out reader for their email once they have scrolled the Explore feed (GEO-2925).
 *
 * `ClientOnly` for the same reason the welcome banner uses it: whether this has been dismissed, and
 * whether anyone is signed in, are both facts that only exist in the browser. Server-rendering a
 * popup that the reader has already closed would flash it back at them on every load.
 */
export function ExploreEmailCapturePopup() {
  return (
    <ClientOnly>
      <EmailCapturePopup />
    </ClientOnly>
  );
}

function EmailCapturePopup() {
  const { user, isModalOpen } = usePrivy();
  const [dismissedNotices, setDismissedNotices] = useAtom(dismissedNoticesAtom);
  const [scrolledEnough, setScrolledEnough] = React.useState(false);
  const [email, setEmail] = React.useState('');
  const [status, setStatus] = React.useState<Status>('idle');

  const dismissed = dismissedNotices.includes(EMAIL_CAPTURE_ID);
  // Signed in is never, not "not yet": the reader already has an account, and the list is for
  // people who do not.
  const eligible = !user && !dismissed;

  React.useEffect(() => {
    if (!eligible || scrolledEnough) return;

    const check = () => {
      if (window.scrollY >= window.innerHeight * SCROLL_TRIGGER_VIEWPORTS) setScrolledEnough(true);
    };

    // Checked once on mount as well as on scroll: a reader who returns to a restored scroll
    // position, or follows a link to an anchor, never fires a scroll event and would otherwise be
    // held below a threshold they are already past.
    check();
    window.addEventListener('scroll', check, { passive: true });
    return () => window.removeEventListener('scroll', check);
  }, [eligible, scrolledEnough]);

  const dismiss = React.useCallback(() => {
    setDismissedNotices(previous => (previous.includes(EMAIL_CAPTURE_ID) ? previous : [...previous, EMAIL_CAPTURE_ID]));
  }, [setDismissedNotices]);

  const submit = React.useCallback(
    async (event: React.FormEvent) => {
      event.preventDefault();
      if (!isLikelyEmail(email)) {
        setStatus('invalid-email');
        return;
      }

      setStatus('submitting');
      try {
        const response = await fetch('/api/newsletter/subscribe', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ email }),
        });
        const body = (await response.json()) as { result?: NewsletterSubscribeResult };
        if (body.result === 'subscribed') {
          setStatus('done');
          // Dismissed on success too, so the reader who signed up is not asked again on the next
          // visit. The list is the point; having joined it is the strongest reason not to ask.
          dismiss();
          return;
        }
        setStatus(body.result ?? 'failed');
      } catch {
        setStatus('failed');
      }
    },
    [dismiss, email]
  );

  // Privy's own modal is a sign-in the reader has actively started. Stacking a second ask on top of
  // it would be the worse of the two interruptions, so this waits rather than competing — and
  // returns on its own once they close it, since `isModalOpen` is reactive.
  // `status === 'done'` keeps it on screen after a successful subscribe. Subscribing also records
  // the dismissal — which is what stops it returning next visit — and without this exception that
  // same write would make the popup ineligible and unmount it on the spot, so the reader would
  // never see the confirmation for the thing they just did.
  if ((!eligible && status !== 'done') || !scrolledEnough || isModalOpen) return null;

  const errorMessage =
    status === 'invalid-email'
      ? 'That does not look like an email address.'
      : status === 'rate-limited'
        ? 'Too many tries just now. Give it a minute.'
        : status === 'failed'
          ? 'Something went wrong. Try again in a moment.'
          : null;

  return (
    <div
      role="dialog"
      aria-label="Geo network launching soon"
      // `z-1101` is one above the chat launcher's `z-1100` (`partials/chat/chat-widget.tsx`), which
      // shares this corner: at `z-100` the assistant's button sat over the "Remind me" button and
      // took the click. Deliberately no higher — the slide-up, status bar and toast layers start at
      // 10000 and a dismissible prompt has no business outranking them.
      className="fixed right-4 bottom-4 z-1101 w-[350px] max-w-[calc(100vw-2rem)] overflow-clip rounded-xl border border-grey-02 bg-white shadow-dropdown"
    >
      {/* The fanned ranking cards on their purple field, from the design (76342:20234).
          A flat raster, like the welcome banner's artwork beside it. Exported through Figma's MCP,
          which renders a node together with whatever overlaps its bounds — so the export arrived
          with the close control drawn into it, and that 16px was patched out from elsewhere in the
          same photo. Invisible at this size and covered by the real button below, but it is why
          this wants a proper export from design, at 2x, before it ships. */}
      <img src="/explore-email-capture.png" alt="" className="block h-[145px] w-full object-cover select-none" />

      {/* The welcome banner's close button, to the class: the two cards sit on the same page, and a
          reader should not have to learn a second dismiss control for the second one. */}
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss"
        className="absolute top-2.5 right-2.5 z-20 rounded-full border border-white/30 bg-black/40 p-1.5 text-white backdrop-blur-sm transition-colors duration-200 ease-in-out hover:bg-black/60"
      >
        <CloseSmall color="white" />
      </button>

      <div className="px-5 pt-[18px] pb-5">
        {status === 'done' ? (
          <>
            <Text variant="mediumTitle">You are on the list.</Text>
            <Text variant="metadata" color="grey-04" className="mt-2 block">
              We will be in touch about features, points, and the path to mainnet.
            </Text>
          </>
        ) : (
          // `noValidate`, and the field below is a text input rather than `type="email"`. Native
          // constraint validation blocks the submit event outright for a malformed address, so the
          // handler never runs and the reader gets a browser bubble instead of our message —
          // different wording in every browser, unstyleable, and gone the moment they look away.
          // `inputMode` and `autoComplete` keep the phone keyboard and the autofill that
          // `type="email"` was there for.
          <form onSubmit={submit} noValidate>
            <Text variant="mediumTitle">Geo network launching soon!</Text>
            <Text variant="metadata" color="grey-04" className="mt-2 block">
              Get updates on features, points, and path to mainnet.
            </Text>

            {/* Side by side, as designed: both pills, the field taking the room the button leaves. */}
            <div className="mt-4 flex items-center gap-1.5">
              <input
                type="text"
                inputMode="email"
                autoComplete="email"
                value={email}
                onChange={event => {
                  setEmail(event.currentTarget.value);
                  // Cleared on edit rather than on submit: the message is about what was typed, and
                  // leaving it under a field they are already fixing reads as a second complaint.
                  if (status !== 'idle' && status !== 'submitting') setStatus('idle');
                }}
                placeholder="nate@geobrowser.io"
                aria-label="Email address"
                aria-invalid={status === 'invalid-email'}
                disabled={status === 'submitting'}
                className={cx(
                  'h-7 min-w-0 flex-1 rounded-full border bg-white px-3 text-metadata text-text outline-hidden transition-colors placeholder:text-grey-03 disabled:text-grey-03',
                  status === 'invalid-email' ? 'border-red-01' : 'border-grey-02 focus:border-text'
                )}
              />
              {/* Not the design-system `Button`: this one is a full pill at 28px on a dark fill,
                  which none of its variants draw — and `Button` also defaults to `type="button"`,
                  which inside a form is silently inert. */}
              <button
                type="submit"
                disabled={status === 'submitting'}
                className="h-7 shrink-0 rounded-full bg-[#151515] px-2.5 text-metadata text-white transition-opacity hover:opacity-90 disabled:opacity-60"
              >
                {status === 'submitting' ? 'Sending…' : 'Remind me'}
              </button>
            </div>

            {errorMessage ? (
              // `role="alert"` on the element rather than on `Text`, which takes no such prop —
              // and it is what makes a failure reach someone who is not watching this corner.
              <p role="alert" className="mt-2">
                <Text variant="footnote" color="red-01">
                  {errorMessage}
                </Text>
              </p>
            ) : null}
          </form>
        )}
      </div>
    </div>
  );
}
