'use client';

import { usePrivy } from '@geogenesis/auth';

import * as React from 'react';

import cx from 'classnames';
import { useAtom } from 'jotai';

import { type NewsletterSubscribeResult, isLikelyEmail } from '~/core/newsletter/subscribe-result';

import { ClientOnly } from '~/design-system/client-only';
import { CloseSmall } from '~/design-system/icons/close-small';

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
          A flat raster, like the welcome banner's artwork beside it. Figma's MCP renders a node
          together with whatever overlaps its bounds, and `contentsOnly` does not change that here,
          so the export arrived with the close glyph drawn into it. Painting it out left a worse
          mark than it removed — the glyph straddles the purple field and a photo card, so nothing
          cloned or blurred from nearby matched both. The real chip below is positioned over it
          instead and hides it completely.

          The raster is full-bleed on purpose. Figma exported the card's own 12px rounding and its
          1px #dbdbdb border baked in, and a second rounding inside the container's own read as a
          pale fringe along the edge — which is what made this look unclean next to the Figma frame.
          The border is gone and the top corners are filled with the field colour, so the container's
          `rounded-xl` is the only radius in play. Still wants a clean export from design, at 2x. */}
      <img src="/explore-email-capture.png" alt="" className="block h-[144px] w-full object-cover select-none" />

      {/* The welcome banner's close button, to the class: the two cards sit on the same page, and a
          reader should not have to learn a second dismiss control for the second one. */}
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss"
        // `top`/`right` put the 24px chip's centre on (322, 23) — where the artwork's own glyph
        // sits — so it is covered rather than doubled. The rest is the banner's button verbatim.
        className="absolute top-[11px] right-4 z-20 rounded-full border border-white/30 bg-black/40 p-1.5 text-white backdrop-blur-sm transition-colors duration-200 ease-in-out hover:bg-black/60"
      >
        <CloseSmall color="white" />
      </button>

      {/* Spacing is the design's, measured off the frame rather than eyeballed (76342:20258 and
          76342:20261). From the artwork's edge at 144.26: text block at y=164, 44 tall; form row at
          y=233, 28 tall; card ends at 281. Sides are 20. Figma trims its text boxes to cap height,
          which CSS only does with `text-box-trim` — not dependable across browsers yet. The leading
          below is set to the design's own box heights instead, which gets the same rhythm and the
          same total: 144 artwork + 20 + 17 heading + 8 + 19 subtext + 25 + 28 row + 20 = 281. */}
      <div className="px-5 pt-5 pb-5">
        {status === 'done' ? (
          <>
            <p className="text-[28px] leading-[17px] font-medium tracking-[-0.84px] text-[#151515]">
              You are on the list.
            </p>
            <p className="mt-[8px] text-[16px] leading-[19px] tracking-[-0.48px] text-[rgba(21,21,21,0.7)]">
              We will be in touch about features, points, and the path to mainnet.
            </p>
          </>
        ) : (
          // `noValidate`, and the field below is a text input rather than `type="email"`. Native
          // constraint validation blocks the submit event outright for a malformed address, so the
          // handler never runs and the reader gets a browser bubble instead of our message —
          // different wording in every browser, unstyleable, and gone the moment they look away.
          // `inputMode` and `autoComplete` keep the phone keyboard and the autofill that
          // `type="email"` was there for.
          <form onSubmit={submit} noValidate>
            <p className="text-[28px] leading-[17px] font-medium tracking-[-0.84px] text-[#151515]">
              Geo Network launching soon!
            </p>
            {/* One line, as in the design. It fits because the app renders Calibre too — the same
                face the frame is set in — at the design's own 16px and -0.48px tracking. The
                `metadata` token is the same size but tracks at -0.25px, and over this sentence that
                extra quarter-pixel per character is what pushed it onto a second line. */}
            <p className="mt-[8px] text-[16px] leading-[19px] tracking-[-0.48px] text-[rgba(21,21,21,0.7)]">
              Get updates on features, points, and path to mainnet.
            </p>

            {/* 217 + 6 + 87 = 310, the design's row across a 350 card with 20 either side. */}
            <div className="mt-[25px] flex h-7 items-center gap-[6px]">
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
                placeholder="Email..."
                aria-label="Email address"
                aria-invalid={status === 'invalid-email'}
                disabled={status === 'submitting'}
                className={cx(
                  'h-7 w-[217px] min-w-0 rounded-full border bg-white px-3 text-[17px] leading-[19px] text-text outline-hidden transition-colors placeholder:text-[#b6b6b6] disabled:text-grey-03',
                  status === 'invalid-email' ? 'border-red-01' : 'border-grey-02 focus:border-text'
                )}
              />
              {/* Not the design-system `Button`: this one is a full pill at 28px on a dark fill,
                  which none of its variants draw — and `Button` also defaults to `type="button"`,
                  which inside a form is silently inert. */}
              <button
                type="submit"
                disabled={status === 'submitting'}
                className="h-7 w-[87px] shrink-0 rounded-full bg-[#151515] text-[16px] tracking-[-0.35px] text-white transition-opacity hover:opacity-90 disabled:opacity-60"
              >
                {status === 'submitting' ? 'Subscribing…' : 'Subscribe'}
              </button>
            </div>

            {errorMessage ? (
              // `role="alert"` on the element rather than on `Text`, which takes no such prop —
              // and it is what makes a failure reach someone who is not watching this corner.
              <p role="alert" className="mt-2 text-[14px] tracking-[-0.35px] text-red-01">
                {errorMessage}
              </p>
            ) : null}
          </form>
        )}
      </div>
    </div>
  );
}
