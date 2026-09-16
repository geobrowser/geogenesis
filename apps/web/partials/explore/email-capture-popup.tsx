'use client';

import { usePrivy } from '@geogenesis/auth';

import * as React from 'react';

import cx from 'classnames';
import { useAtom } from 'jotai';

import { type NewsletterSubscribeResult, isLikelyEmail } from '~/core/newsletter/subscribe-result';

import { Button } from '~/design-system/button';
import { ClientOnly } from '~/design-system/client-only';
import { CloseSmall } from '~/design-system/icons/close-small';
import { Input } from '~/design-system/input';
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
      aria-label="Subscribe for updates"
      className="fixed right-4 bottom-4 z-100 w-[min(22rem,calc(100vw-2rem))] rounded-lg border border-grey-02 bg-white p-4 shadow-dropdown"
    >
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss"
        className="absolute top-3 right-3 text-grey-04 transition-colors hover:text-text"
      >
        <CloseSmall />
      </button>

      {status === 'done' ? (
        <div className="pr-6">
          <Text variant="bodySemibold">You are on the list.</Text>
          <Text variant="footnote" color="grey-04" className="mt-1 block">
            We will let you know what is worth arguing about.
          </Text>
        </div>
      ) : (
        // `noValidate`, and the field below is a text input rather than `type="email"`. Native
        // constraint validation blocks the submit event outright for a malformed address, so the
        // handler never runs and the reader gets a browser bubble instead of our message —
        // different wording in every browser, unstyleable, and gone the moment they look away.
        // `inputMode` and `autoComplete` keep the phone keyboard and the autofill that
        // `type="email"` was there for.
        <form onSubmit={submit} noValidate>
          <div className="pr-6">
            <Text variant="bodySemibold">Keep up with Geo</Text>
            <Text variant="footnote" color="grey-04" className="mt-1 block">
              Get the debates and claims worth your time, now and then.
            </Text>
          </div>
          <div className="mt-3 flex flex-col gap-2">
            <Input
              type="text"
              inputMode="email"
              autoComplete="email"
              value={email}
              onChange={event => {
                setEmail(event.currentTarget.value);
                // Clearing on edit rather than on submit: the message is about what was typed, and
                // leaving it under a field they are already fixing reads as a second complaint.
                if (status !== 'idle' && status !== 'submitting') setStatus('idle');
              }}
              placeholder="you@example.com"
              aria-label="Email address"
              aria-invalid={status === 'invalid-email'}
              disabled={status === 'submitting'}
            />
            {/* `type="submit"` explicitly: the design-system `Button` defaults to `type="button"`,
                which is right for the buttons it is usually used for and silently does nothing
                inside a form. The spread puts this after the default, so it wins. */}
            <Button
              type="submit"
              variant="primary"
              disabled={status === 'submitting'}
              className={cx('w-full justify-center')}
            >
              {status === 'submitting' ? 'Subscribing…' : 'Subscribe'}
            </Button>
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
  );
}
