'use client';

import { useLoginWithEmail } from '@geogenesis/auth';

import * as React from 'react';

import cx from 'classnames';

import { currentAuthAttempt, openAuthAttempt } from '~/core/auth-attempt';
import { usePrivySignIn } from '~/core/hooks/use-privy-sign-in';
import { beginPrivyAuth, completePrivyAuth } from '~/core/privy-auth-events';

import { CONTROL_HEIGHT_CLASS, CONTROL_LABEL_CLASS, SUBTEXT_CLASS } from './email-capture-styles';

/** Privy's OTP is six digits. */
const CODE_LENGTH = 6;

// The headless attempt and its modal fallback belong to the same signup surface.
export type AccountAnalytics = {
  component: string;
  auth_control: string;
  auth_trigger: string;
  target_type: string;
  target_id: string;
  link_source: string;
  form_type: string;
  signup_surface: string;
};

export const ACCOUNT_ANALYTICS = {
  component: 'explore_email_capture',
  auth_control: 'create_account',
  auth_trigger: 'control',
  target_type: 'application',
  target_id: 'genesis',
  link_source: 'explore_email_capture',
  form_type: 'account',
  signup_surface: 'explore_email_capture',
} as const;

/**
 * The code step, driven by Privy's own flow state rather than a second copy of it kept here.
 *
 * One field rather than six boxes: paste works without per-box splitting, screen readers get one
 * labelled control instead of six unlabelled ones, and the code arrives by mail, so pasting is what
 * most people actually do.
 */
export function AccountStep({
  email,
  onGiveUp,
  analytics = ACCOUNT_ANALYTICS,
}: {
  email: string;
  onGiveUp: () => void;
  /**
   * Who is asking, for the auth attempt and its completion. Explore's capture by default; the
   * full-screen debate player's inline sign-up passes its own, so the two are counted apart.
   */
  analytics?: typeof ACCOUNT_ANALYTICS | AccountAnalytics;
}) {
  // Read through a ref: the attempt is opened once, on mount, and completes long after.
  const analyticsRef = React.useRef(analytics);
  analyticsRef.current = analytics;
  // Headless email completion runs directly after verification, even if authentication has
  // already unmounted this card. Modal completions go through the app-wide PrivyAuthTracker.
  // EmbeddedWalletSync separately creates and activates the wallet for a headless login.
  const {
    sendCode,
    loginWithCode,
    state: otpState,
  } = useLoginWithEmail({
    onComplete: args => completePrivyAuth(args, analyticsRef.current),
  });
  // Held in a ref so the effect below does not re-run and re-send when the callback identity
  // changes, which would mail a second code on an unrelated re-render.
  const giveUpRef = React.useRef(onGiveUp);
  giveUpRef.current = onGiveUp;
  // Keep the modal fallback's UI error handler with the card; its analytics attribution is
  // snapshotted by usePrivySignIn and survives the card disappearing after authentication.
  const openPrivyModal = usePrivySignIn(undefined, {
    analytics,
    resumeAuthAttempt: true,
    onError: () => giveUpRef.current(),
  });
  const [code, setCode] = React.useState('');

  const openPrivyModalRef = React.useRef(openPrivyModal);
  openPrivyModalRef.current = openPrivyModal;
  // Behind a ref because a hook's returned callbacks are new objects on every render. Naming
  // `sendCode` as a dependency below makes `requestCode` new on every render too, and the effect
  // that depends on *it* re-fires -- mailing a fresh code each time, wiping the field mid-typing,
  // and eventually tripping Privy's own limit, whose rejection lands in the fallback and throws up
  // the dialog this exists to avoid. Which is exactly what it did.
  const sendCodeRef = React.useRef(sendCode);
  sendCodeRef.current = sendCode;

  // A rejection can land after the reader has closed the card -- they dismissed it while the
  // request was still open. Acting on that would take an explicit dismissal and answer it by
  // throwing up a login dialog, which is the opposite of what they asked for.
  const mountedRef = React.useRef(true);
  React.useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // One request at a time. Both resend controls were live during `submitting-code`, so a reader
  // who pressed resend while a verification was in flight retired the very code being checked --
  // and in the error state, repeated presses fired again before Privy's state had left `error`.
  const [sending, setSending] = React.useState(false);

  const requestCode = React.useCallback(async () => {
    setSending(true);
    setCode('');
    try {
      await sendCodeRef.current({ email });
    } catch {
      if (!mountedRef.current) return;
      // Captcha, a Privy outage, an address it will not take. Hand them the dialog that does work
      // rather than a dead end.
      // Keep the step mounted while hidden so the modal's error callback can close the card.
      openPrivyModalRef.current();
    } finally {
      if (mountedRef.current) setSending(false);
    }
  }, [email]);

  // Sent on mount rather than on the press, so this component owns the whole flow and the parent
  // owns none of it.
  //
  // Guarded as well as keyed on a stable callback: one code is what mounting means, and the guard
  // holds even under StrictMode's deliberate double-invoke, where the dependency array alone does
  // not. A second send mails a second code and silently retires the first, so the one the reader
  // is looking at stops working.
  const hasRequestedRef = React.useRef(false);
  React.useEffect(() => {
    if (hasRequestedRef.current) return;
    hasRequestedRef.current = true;
    const attempt = currentAuthAttempt();
    const surface = analyticsRef.current;
    if (!attempt || attempt.endedAt || attempt.properties.component !== surface.component)
      beginPrivyAuth(surface, { resume: true });
    openAuthAttempt(surface);
    void requestCode();
  }, [requestCode]);

  const submitCode = React.useCallback(
    async (event: React.FormEvent) => {
      event.preventDefault();
      if (code.length !== CODE_LENGTH) return;
      try {
        await loginWithCode({ code });
        // Nothing to do on success. `authenticated` flips, the guard in the parent unmounts this,
        // and onboarding picks up a new account with no profile on its own.
      } catch {
        // Privy puts the reason in `otpState`, which the markup below reads.
      }
    },
    [code, loginWithCode]
  );

  // `autoFocus` cannot do this job. The field renders enabled for one frame, takes focus, and is
  // then disabled by the send that starts on mount -- which blurs it, and nothing focuses it again
  // when the send resolves. The reader is left having to click into the field this step exists to
  // put them in. Focused when it actually becomes usable instead.
  const codeInputRef = React.useRef<HTMLInputElement>(null);

  const busy = sending || otpState.status === 'sending-code' || otpState.status === 'submitting-code';
  const verifying = otpState.status === 'submitting-code';
  const failed = otpState.status === 'error';

  React.useEffect(() => {
    if (!busy) codeInputRef.current?.focus();
  }, [busy]);

  return (
    <form
      data-geo-analytics-label="Explore account verification"
      data-geo-analytics-type="account"
      data-geo-analytics-intent="signup"
      onSubmit={submitCode}
      noValidate
    >
      {/* The card's own subtext style, shared from the popup so the two states are one design
          rather than two that drifted. */}
      <p className={SUBTEXT_CLASS}>
        {busy && !verifying ? 'Sending a code to ' : 'Enter the code we sent to '}
        <span className="text-[#151515]">{email}</span>
      </p>

      {/* The subscribe row's layout after the restyle: a column, same spacing and width, so the
          card does not change shape when it swaps to this step. */}
      <div className="mt-[19px] flex flex-col gap-[6px] mobile:mx-auto mobile:mt-5 mobile:max-w-[394px]">
        <input
          // `text` with a numeric `inputMode`, not `type="number"`: a number input drops leading
          // zeros, accepts `e` and `-`, and puts a spinner on a field that is not a quantity.
          ref={codeInputRef}
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          // Lets iOS and Chrome offer the code straight from the message, which is the whole reason
          // `one-time-code` exists and the fastest path through this step.
          //
          // No `maxLength`: the browser enforces it on the raw input, before `onChange` ever sees
          // it. Pasting "123 456" from a mail client would be cut to "123 45" and only then have
          // its spaces stripped, leaving five digits and a step that cannot be completed — while
          // looking, to the reader, like they pasted the wrong thing. The slice below does the same
          // job on the normalized value, which is the only place it is correct.
          pattern="\d*"
          value={code}
          onChange={event => setCode(event.currentTarget.value.replace(/\D/g, '').slice(0, CODE_LENGTH))}
          placeholder="123456"
          aria-label="Verification code"
          aria-invalid={failed}
          disabled={busy}
          className={cx(
            `${CONTROL_HEIGHT_CLASS} w-full min-w-0 rounded-full border bg-white px-3 text-center text-[17px] leading-[19px] tracking-[0.2em] text-text outline-hidden transition-colors placeholder:tracking-[0.2em] placeholder:text-[#b6b6b6] disabled:text-grey-03`,
            failed ? 'border-red-01' : 'border-grey-02 focus:border-text'
          )}
        />
        <button
          type="submit"
          disabled={busy || code.length !== CODE_LENGTH}
          className={`inline-flex ${CONTROL_HEIGHT_CLASS} ${CONTROL_LABEL_CLASS} w-full items-center justify-center rounded-full bg-[#151515] px-2.5 whitespace-nowrap text-white transition-opacity hover:opacity-90 disabled:opacity-60`}
        >
          {verifying ? 'Verifying…' : 'Continue'}
        </button>
      </div>

      {failed ? (
        <p role="alert" className="mt-2 text-[14px] tracking-[-0.35px] text-red-01">
          That code did not work.{' '}
          <button
            type="button"
            onClick={() => void requestCode()}
            disabled={busy}
            className="underline underline-offset-2 disabled:opacity-60"
          >
            Send a new one
          </button>
        </p>
      ) : (
        // Always reachable, not only after a failure: a code can simply not arrive, and Privy
        // retires one after five wrong attempts, at which point the only way forward is a new code.
        <p className="mt-2 text-[14px] tracking-[-0.35px] text-[rgba(21,21,21,0.7)]">
          <button
            type="button"
            onClick={() => void requestCode()}
            disabled={busy}
            className="underline underline-offset-2 disabled:opacity-60"
          >
            Send a new code
          </button>
        </p>
      )}
    </form>
  );
}
