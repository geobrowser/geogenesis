'use client';

import { useLoginWithEmail } from '@geogenesis/auth';

import * as React from 'react';

import cx from 'classnames';

import { trackPrivyAuth } from '~/core/analytics';
import { usePrivySignIn } from '~/core/hooks/use-privy-sign-in';

import { CONTROL_HEIGHT_CLASS, CONTROL_LABEL_CLASS, SUBTEXT_CLASS } from './email-capture-styles';

/** Privy's OTP is six digits. */
const CODE_LENGTH = 6;

/**
 * The code step, driven by Privy's own flow state rather than a second copy of it kept here.
 *
 * One field rather than six boxes: paste works without per-box splitting, screen readers get one
 * labelled control instead of six unlabelled ones, and the code arrives by mail, so pasting is what
 * most people actually do.
 */
export function AccountStep({ email, onGiveUp }: { email: string; onGiveUp: () => void }) {
  // Mounted only while someone is signing up, which is the point of it living here: Privy's login
  // hooks register on a shared emitter, and one of these sitting on every Explore visit would be
  // registering callbacks beside the navbar's own login for every reader who never presses the
  // button that leads here — which is what broke that button.
  //
  // The embedded wallet this login needs is not created here. It cannot be: this component is
  // unmounted by the card's own visibility rule the instant `authenticated` turns true, which is
  // the exact render in which the wallet becomes creatable. `useEnsureEmbeddedWallet`, mounted for
  // the life of the app in `core/providers.tsx`, does it instead.
  // Reports its own sign-in, which is safe now that the navbar arms its tracker rather than firing
  // on every completion. Leaving it to the navbar looked tidy and was not: that button is replaced
  // by a loading skeleton whenever `isUserLoading` is true — which flips back mid-session on a tab
  // refocus or a Privy re-init — so a completion landing in that window was recorded by nobody at
  // all. Silent under-counting of exactly the signups this flow exists to produce.
  const {
    sendCode,
    loginWithCode,
    state: otpState,
  } = useLoginWithEmail({
    onComplete: args => trackPrivyAuth(args, { auth_flow: 'manual_login', link_source: 'explore_email_capture' }),
  });
  // Here for the same reason as the hook above, and it is the one that matters more: this registers
  // a second `useLogin` beside the navbar's own, and the navbar's is the login button people
  // actually press. Mounted in the parent it would do that on every Explore visit.
  const openPrivyModal = usePrivySignIn();
  const [code, setCode] = React.useState('');

  // Held in a ref so the effect below does not re-run and re-send when the callback identity
  // changes, which would mail a second code on an unrelated re-render.
  const giveUpRef = React.useRef(onGiveUp);
  giveUpRef.current = onGiveUp;
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
      // Closing this card unmounts the `usePrivySignIn` instance that registered the modal's
      // completion callback, so this flow's own `link_source` attribution is lost for the fallback.
      // The sign-in itself is still recorded: the navbar's `GeoConnectButton` is mounted for every
      // logged-out reader (`navbar-actions.tsx` renders it whenever there is no address) and its
      // `onComplete` tracks unconditionally. Keeping this mounted behind the modal to reclaim one
      // attribution field would mean a small state machine in auth code, watching the modal open
      // and close again, for a branch that only runs when `sendCode` has already failed.
      giveUpRef.current();
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
    <form onSubmit={submitCode} noValidate>
      {/* The card's own subtext style, shared from the popup so the two states are one design
          rather than two that drifted. */}
      <p className={SUBTEXT_CLASS}>
        {busy && !verifying ? 'Sending a code to ' : 'Enter the code we sent to '}
        <span className="text-[#151515]">{email}</span>
      </p>

      {/* The subscribe row's layout after the restyle: a column, same spacing and width, so the
          card does not change shape when it swaps to this step. */}
      <div className="mt-[19px] flex flex-col gap-[6px] sm:mx-auto sm:mt-5 sm:max-w-[394px]">
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
