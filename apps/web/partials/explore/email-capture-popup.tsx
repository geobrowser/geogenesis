'use client';

import { type UseLoginWithEmail, useLoginWithEmail, usePrivy } from '@geogenesis/auth';

import * as React from 'react';

import cx from 'classnames';
import { useAtomValue } from 'jotai';

import { useDebatesHub } from '~/core/debates/matchmaking/use-debates-hub';
import { useAnyModalOpen } from '~/core/hooks/use-any-modal-open';
import { useDismissedNotice } from '~/core/hooks/use-dismissed-notice';
import { usePrivySignIn } from '~/core/hooks/use-privy-sign-in';
import { type NewsletterSubscribeResult, isLikelyEmail } from '~/core/newsletter/subscribe-result';
import { timeoutSignal } from '~/core/timeout-signal';

import { entitySidePanelAtom } from '~/atoms';
import { isChatOpenAtom } from '~/core/state/chat-store';

import { ClientOnly } from '~/design-system/client-only';
import { CloseSmall } from '~/design-system/icons/close-small';


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

/**
 * The same guard the route puts on its own call to MailerLite, for the same reason: a request that
 * is accepted and never answered would otherwise leave this stuck in `submitting` with the button
 * disabled and no way forward. Longer than the route's own eight seconds on purpose — the server's
 * specific answer should win whenever it is coming, and this is only for when nothing is.
 */
const SUBMIT_TIMEOUT_MS = 15_000;

type Status = 'idle' | 'submitting' | 'done' | NewsletterSubscribeResult;

/** Privy's OTP is six digits. */
const CODE_LENGTH = 6;

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
  const { ready, authenticated, isModalOpen } = usePrivy();
  const isChatOpen = useAtomValue(isChatOpenAtom);
  const { isOpen: isDebatesHubOpen } = useDebatesHub();
  const entitySidePanelTarget = useAtomValue(entitySidePanelAtom);
  const { dismissed, remember: rememberDismissed } = useDismissedNotice(EMAIL_CAPTURE_ID);
  const [scrolledEnough, setScrolledEnough] = React.useState(false);
  const [email, setEmail] = React.useState('');
  const [status, setStatus] = React.useState<Status>('idle');
  // Separate from the persisted notice below. Subscribing *records* the dismissal so the popup does
  // not return next visit, but it must not close the card out from under the confirmation — so the
  // two are different acts: one remembers, one closes.
  const [closed, setClosed] = React.useState(false);

  // Privy's headless email login. The reader has just typed their address into the form above, so
  // the modal's first step -- asking for it again -- is the one thing worth removing. `state` is
  // Privy's own flow state ('sending-code' | 'awaiting-code-input' | 'submitting-code' | 'error' |
  // 'done'), which is more trustworthy than a second copy of the same machine kept here.
  const { sendCode, loginWithCode, state: otpState } = useLoginWithEmail();
  const [wantsAccount, setWantsAccount] = React.useState(false);
  const [code, setCode] = React.useState('');
  // The address as accepted, so the account is created against what was actually subscribed rather
  // than whatever is in the field if they keep typing.
  const [subscribedEmail, setSubscribedEmail] = React.useState('');
  // Falls back to Privy's own dialog if the shortcut cannot start. Signing up is the point; not
  // retyping an email is a convenience, and it must not become the reason nobody can sign up.
  const openPrivyModal = usePrivySignIn();

  // Watched only while the popup could still appear. The observer covers the whole body on a page
  // holding an infinite feed, so leaving it on after the card is dismissed, closed, or made moot by
  // signing in would keep scanning the document for every card the feed appends, to answer a
  // question that can no longer change anything. `status === 'done'` keeps it on through the
  // confirmation, which is still on screen and still owes the same precedence.
  const couldStillShow =
    scrolledEnough && !closed && ready && !authenticated && (!dismissed || status === 'done');
  const isAnyModalOpen = useAnyModalOpen(couldStillShow);

  // Anything the reader deliberately opened owns the screen until they close it, and this waits
  // rather than competing. Not a z-index rule: each of these is a surface someone chose to open,
  // and an unasked-for signup card over it is the worse interruption whichever draws on top.
  //
  // `useAnyModalOpen` is the general half, and it exists because the specific half kept losing.
  // This guard was built by naming surfaces one at a time and every round of review found another
  // — the sign-in prompt and global search were the fifth and sixth — which is the signal that
  // enumerating was the wrong method. Asking the document whether a modal is open covers those two
  // and whatever is added next, without anyone remembering to come back here.
  //
  // The named ones stay because none of them is a modal dialog and none would be caught:
  //
  //  - Privy's modal lives in its own portal and reports through `usePrivy`.
  //  - The chat panel shares this exact corner (`chat-panel.tsx` is `z-1100` at the same
  //    `fixed right-4 bottom-…`), so one above it covers its controls and takes their clicks.
  //  - The debates hub opens from the welcome banner on this very page. Its mobile sheet is
  //    `aria-modal` and would be caught; its desktop aside is deliberately a non-modal companion
  //    panel, carrying no dialog role, and would not.
  //  - The entity side panel is what every card title opens here (`titleOpensSidePanel`).
  //
  // All reactive, so the popup returns on its own once they close whichever it was.
  const anOverlayIsOpen =
    isModalOpen || isChatOpen || isDebatesHubOpen || entitySidePanelTarget !== null || isAnyModalOpen;

  React.useEffect(() => {
    if (authenticated || dismissed || scrolledEnough) return;

    const check = () => {
      if (window.scrollY >= window.innerHeight * SCROLL_TRIGGER_VIEWPORTS) setScrolledEnough(true);
    };

    // Checked once on mount as well as on scroll: a reader who returns to a restored scroll
    // position, or follows a link to an anchor, never fires a scroll event and would otherwise be
    // held below a threshold they are already past.
    check();
    window.addEventListener('scroll', check, { passive: true });
    return () => window.removeEventListener('scroll', check);
  }, [authenticated, dismissed, scrolledEnough]);

  /** What the close button does: remember it, and take it off the screen now. */
  const close = React.useCallback(() => {
    rememberDismissed();
    setClosed(true);
  }, [rememberDismissed]);


  /**
   * Asks Privy for a code against the address they just subscribed with.
   *
   * Fired the moment they press, so the mail is already in flight while the card swaps to the code
   * field -- there is no code waiting from the newsletter signup, which sends none, so this request
   * is what creates one.
   */
  const startAccount = React.useCallback(async () => {
    setWantsAccount(true);
    try {
      await sendCode({ email: subscribedEmail });
    } catch {
      // Captcha, a Privy outage, an address it will not take. Hand them the dialog that does work
      // rather than a dead end, and let it carry the address in the normal way.
      setWantsAccount(false);
      close();
      openPrivyModal();
    }
  }, [sendCode, subscribedEmail, close, openPrivyModal]);

  const submitCode = React.useCallback(
    async (event: React.FormEvent) => {
      event.preventDefault();
      if (code.length !== CODE_LENGTH) return;
      try {
        await loginWithCode({ code });
        // Nothing to do on success. `authenticated` flips, the guard above unmounts this, and the
        // onboarding dialog picks up a new account with no profile on its own.
      } catch {
        // Privy puts the reason in `otpState`, which the code step reads.
      }
    },
    [code, loginWithCode]
  );

  /** A fresh code, after five wrong attempts have killed the last one or it has expired. */
  const resendCode = React.useCallback(async () => {
    setCode('');
    try {
      await sendCode({ email: subscribedEmail });
    } catch {
      setWantsAccount(false);
      close();
      openPrivyModal();
    }
  }, [sendCode, subscribedEmail, close, openPrivyModal]);

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
          // Names the surface so the signup is filed under its own group. The server resolves this
          // against a closed map; it is not a group name and cannot become one.
          body: JSON.stringify({ email, source: 'explore' }),
          signal: timeoutSignal(SUBMIT_TIMEOUT_MS),
        });
        const body = (await response.json()) as { result?: NewsletterSubscribeResult };
        if (body.result === 'subscribed') {
          setStatus('done');
          setSubscribedEmail(email.trim());
          // Recorded, not closed. Having joined is the strongest reason not to ask again next
          // visit, but the confirmation still has to be readable — and still has to be closable,
          // which it was not while this called the same function the close button does.
          rememberDismissed();
          return;
        }
        setStatus(body.result ?? 'failed');
      } catch {
        setStatus('failed');
      }
    },
    [email, rememberDismissed]
  );

  // Signed in is never, not "not yet": the reader already has an account, and the list is for
  // people who do not. Unconditional, and deliberately outside the `done` exception below — an
  // earlier version let the success state bypass the whole eligibility check, so signing in while
  // the confirmation was open left a logged-out-only card sitting there for a logged-in reader.
  //
  // `ready` is what makes "signed in" true rather than nearly true. Privy reports
  // `authenticated: false` while it is still restoring a session from storage, so without it a
  // signed-in reader returning to a restored scroll position is briefly indistinguishable from an
  // anonymous one — long enough to be shown a signup card and to start typing into it before it
  // vanishes under them. `core/auth/use-sign-in-deep-link.ts` gates on `ready` for the same reason.
  if (closed || !ready || authenticated || !scrolledEnough || anOverlayIsOpen) return null;

  // Dismissal is the one thing the confirmation is exempt from, and only that. Subscribing records
  // the dismissal — which is what stops the popup returning next visit — and without this the same
  // write would unmount the card on the spot, so nobody would see the confirmation for the thing
  // they just did.
  if (dismissed && status !== 'done') return null;

  const errorMessage =
    status === 'invalid-email'
      ? 'That does not look like an email address.'
      : status === 'rate-limited'
        ? 'Too many tries from here. Please try again later.'
        : status === 'failed'
          ? 'Something went wrong. Try again in a moment.'
          : null;

  return (
    <div
      // A named `region` rather than a `dialog`. Nothing here asked to be opened, so the focus move
      // a dialog owes its reader would be an interruption mid-sentence — and a `dialog` that never
      // takes focus is the worst of both, promising behaviour that is not implemented. As a
      // landmark this is reachable by the same landmark navigation used to skip between page
      // sections, and it is mounted ahead of the feed (`explore-page.tsx`) so tabbing reaches it
      // early rather than after an infinite list, which is where it actually sits on screen.
      role="region"
      aria-label="Geo network launching soon"
      // Escape closes it, scoped to the card: while focus is inside, Escape is unambiguous. A
      // document listener would take the key from whatever else the reader is doing out in the feed.
      onKeyDown={event => {
        if (event.key === 'Escape') close();
      }}
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

          `object-right` rather than the default centre, which matters below 382px where the card
          stops being 350 wide and `object-cover` starts cropping. Centred, it crops evenly and the
          baked glyph drifts left while the real button stays at `right-4` — 31px apart on a 320px
          viewport, which uncovers the very glyph the chip is there to hide. Anchored right, the
          glyph and the button are both measured from the same edge and stay aligned at every width.

          The raster is full-bleed on purpose. Figma exported the card's own 12px rounding and its
          1px #dbdbdb border baked in, and a second rounding inside the container's own read as a
          pale fringe along the edge — which is what made this look unclean next to the Figma frame.
          The border is gone and the top corners are filled with the field colour, so the container's
          `rounded-xl` is the only radius in play. Still wants a clean export from design, at 2x. */}
      <img src="/explore-email-capture.png" alt="" className="block h-[144px] w-full object-right object-cover select-none" />

      {/* The welcome banner's close button, to the class: the two cards sit on the same page, and a
          reader should not have to learn a second dismiss control for the second one. */}
      <button
        type="button"
        onClick={close}
        // Named, not just "Dismiss": the welcome banner sits on this same page with its own
        // dismiss button, and a list of controls reading "Dismiss" twice says nothing about which
        // notice either one closes. Matches how the banner names its own.
        aria-label="Dismiss newsletter signup"
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
          same total: 144 artwork + 20 + 17 heading + 8 + 19 subtext + 20 + 28 row + 25 = 281. */}
      <div className="px-5 pt-5 pb-[25px]">
        {status === 'done' ? (
          // `role="status"` because submitting removes the button that had focus, so a reader who
          // is not watching this corner would otherwise get silence where the confirmation is. The
          // failure path has had `role="alert"` all along; this is the same courtesy for the case
          // that actually worked.
          <div role="status">
            {/* Same leading, same reason. Shorter copy, but at 28px in 248px it is close enough
                to the edge that leaving it out would be relying on the string never changing. */}
            <p className="text-[28px] leading-[17px] font-medium tracking-[-0.84px] text-[#151515] max-[382px]:leading-[30px]">
              {wantsAccount ? 'Check your email.' : 'You are on the list.'}
            </p>

            {wantsAccount ? (
              <CodeStep
                email={subscribedEmail}
                code={code}
                onCodeChange={setCode}
                otpState={otpState}
                onSubmit={submitCode}
                onResend={resendCode}
              />
            ) : (
              <>
                <p className="mt-[8px] text-[16px] leading-[19px] tracking-[-0.48px] text-[rgba(21,21,21,0.7)]">
                  Want an account? We can use the email you just gave us.
                </p>

                {/* The confirmation used to be a dead end whose only action was dismissing it, and
                    this is the moment someone is most willing -- they have just handed over an
                    address on purpose. "Skip" is exactly the old behaviour, kept as an equal
                    option rather than a smaller one, because the newsletter signup they already
                    completed is a real outcome and nothing here should read as undoing it. */}
                <div className="mt-5 flex h-7 items-center gap-[6px]">
                  <button
                    type="button"
                    onClick={startAccount}
                    className="inline-flex h-7 shrink-0 items-center justify-center rounded-full bg-[#151515] px-4 text-[16px] leading-none tracking-[-0.35px] whitespace-nowrap text-white transition-opacity hover:opacity-90"
                  >
                    Create account
                  </button>
                  <button
                    type="button"
                    onClick={close}
                    className="inline-flex h-7 shrink-0 items-center justify-center rounded-full border border-grey-02 px-4 text-[16px] leading-none tracking-[-0.35px] whitespace-nowrap text-[rgba(21,21,21,0.7)] transition-colors hover:border-text hover:text-text"
                  >
                    Skip
                  </button>
                </div>
              </>
            )}
          </div>
        ) : (
          // `noValidate`, and the field below is a text input rather than `type="email"`. Native
          // constraint validation blocks the submit event outright for a malformed address, so the
          // handler never runs and the reader gets a browser bubble instead of our message —
          // different wording in every browser, unstyleable, and gone the moment they look away.
          // `inputMode` and `autoComplete` keep the phone keyboard and the autofill that
          // `type="email"` was there for.
          <form onSubmit={submit} noValidate>
            {/* 17px leading under a 28px glyph is a single-line leading — it is the design's
                cap-height trim, and it only holds while the line does not wrap. Below 382px the
                card stops being 350 wide (350 + 2rem of viewport margin), leaving 248px inside the
                padding, and this headline wraps — at which point 17px puts the second baseline
                inside the first line's glyphs. 30px is the smallest leading that clears them.
                Confirmed the variant actually compiles rather than trusting the class name: the
                build emits `@media not all and (min-width:382px){…line-height:30px}`. Above the
                threshold nothing changes, so the design is untouched where the design applies. */}
            <p className="text-[28px] leading-[17px] font-medium tracking-[-0.84px] text-[#151515] max-[382px]:leading-[30px]">
              Geo Network launching soon!
            </p>
            {/* One line, as in the design. It fits because the app renders Calibre too — the same
                face the frame is set in — at the design's own 16px and -0.48px tracking. The
                `metadata` token is the same size but tracks at -0.25px, and over this sentence that
                extra quarter-pixel per character is what pushed it onto a second line. */}
            <p className="mt-[8px] text-[16px] leading-[19px] tracking-[-0.48px] text-[rgba(21,21,21,0.7)]">
              Get updates on features, points, and path to mainnet.
            </p>

            {/* 20 below the subtext, which the design moved up to (row y went 233 -> 228 against a
                text block ending at 208). 217 + 6 + 87 = 310, across a 350 card with 20 either
                side. */}
            <div className="mt-5 flex h-7 items-center gap-[6px]">
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
                className="inline-flex h-7 w-[87px] shrink-0 items-center justify-center rounded-full bg-[#151515] text-[16px] leading-none tracking-[-0.35px] whitespace-nowrap text-white transition-opacity hover:opacity-90 disabled:opacity-60"
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

/**
 * The code step, driven by Privy's own flow state rather than a second copy of it kept here.
 *
 * One field rather than six boxes: paste works without per-box splitting, screen readers get one
 * labelled control instead of six unlabelled ones, and the code arrives by mail, so pasting is what
 * most people actually do.
 */
function CodeStep({
  email,
  code,
  onCodeChange,
  otpState,
  onSubmit,
  onResend,
}: {
  email: string;
  code: string;
  onCodeChange: (code: string) => void;
  otpState: UseLoginWithEmail['state'];
  onSubmit: (event: React.FormEvent) => void;
  onResend: () => void;
}) {
  const sending = otpState.status === 'sending-code';
  const verifying = otpState.status === 'submitting-code';
  const failed = otpState.status === 'error';

  return (
    <form onSubmit={onSubmit} noValidate>
      <p className="mt-[8px] text-[16px] leading-[19px] tracking-[-0.48px] text-[rgba(21,21,21,0.7)]">
        {sending ? 'Sending a code to ' : 'Enter the code we sent to '}
        <span className="text-[#151515]">{email}</span>
      </p>

      <div className="mt-5 flex h-7 items-center gap-[6px]">
        <input
          // `text` with a numeric `inputMode`, not `type="number"`: a number input drops leading
          // zeros, accepts `e` and `-`, and puts a spinner on a field that is not a quantity.
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          // Lets iOS and Chrome offer the code straight from the message, which is the whole reason
          // `one-time-code` exists and the fastest path through this step.
          pattern="\d*"
          maxLength={CODE_LENGTH}
          value={code}
          onChange={event => onCodeChange(event.currentTarget.value.replace(/\D/g, '').slice(0, CODE_LENGTH))}
          placeholder="123456"
          aria-label="Verification code"
          aria-invalid={failed}
          disabled={sending || verifying}
          autoFocus
          className={cx(
            'h-7 w-[132px] min-w-0 rounded-full border bg-white px-3 text-[17px] leading-[19px] tracking-[0.2em] text-text outline-hidden transition-colors placeholder:tracking-[0.2em] placeholder:text-[#b6b6b6] disabled:text-grey-03',
            failed ? 'border-red-01' : 'border-grey-02 focus:border-text'
          )}
        />
        <button
          type="submit"
          disabled={sending || verifying || code.length !== CODE_LENGTH}
          className="inline-flex h-7 shrink-0 items-center justify-center rounded-full bg-[#151515] px-4 text-[16px] leading-none tracking-[-0.35px] whitespace-nowrap text-white transition-opacity hover:opacity-90 disabled:opacity-60"
        >
          {verifying ? 'Verifying…' : 'Continue'}
        </button>
      </div>

      {failed ? (
        <p role="alert" className="mt-2 text-[14px] tracking-[-0.35px] text-red-01">
          That code did not work.{' '}
          <button type="button" onClick={onResend} className="underline underline-offset-2">
            Send a new one
          </button>
        </p>
      ) : (
        // Always reachable, not only after a failure: a code can simply not arrive, and Privy
        // retires one after five wrong attempts, at which point the only way forward is a new code.
        <p className="mt-2 text-[14px] tracking-[-0.35px] text-[rgba(21,21,21,0.7)]">
          <button
            type="button"
            onClick={onResend}
            disabled={sending}
            className="underline underline-offset-2 disabled:opacity-60"
          >
            Send a new code
          </button>
        </p>
      )}
    </form>
  );
}
