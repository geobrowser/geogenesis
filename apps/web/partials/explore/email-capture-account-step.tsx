'use client';

import { useLoginWithEmail } from '@geogenesis/auth';

import * as React from 'react';

import cx from 'classnames';

import { usePrivySignIn } from '~/core/hooks/use-privy-sign-in';

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
  const { sendCode, loginWithCode, state: otpState } = useLoginWithEmail();
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

  const requestCode = React.useCallback(async () => {
    setCode('');
    try {
      await sendCodeRef.current({ email });
    } catch {
      // Captcha, a Privy outage, an address it will not take. Hand them the dialog that does work
      // rather than a dead end.
      giveUpRef.current();
      openPrivyModalRef.current();
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

  const sending = otpState.status === 'sending-code';
  const verifying = otpState.status === 'submitting-code';
  const failed = otpState.status === 'error';

  return (
    <form onSubmit={submitCode} noValidate>
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
          onChange={event => setCode(event.currentTarget.value.replace(/\D/g, '').slice(0, CODE_LENGTH))}
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
          <button type="button" onClick={() => void requestCode()} className="underline underline-offset-2">
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
