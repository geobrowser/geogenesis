'use client';

import * as React from 'react';

import { startAnalyticsSoon } from '~/core/analytics';
import { openAuthAttempt, readAuthAttempt, subscribeAuthAttempts } from '~/core/auth-attempt';
import { isGoogleSignInStarting, useContinueWithGoogle } from '~/core/auth/continue-with-google';
import { type SignInBoxRequest, closeSignInBox, useSignInBoxRequest } from '~/core/auth/sign-in-box/sign-in-box-store';
import { isLikelyEmail } from '~/core/newsletter/subscribe-result';
import { cancelPrivyAuthAttempt } from '~/core/privy-auth-events';
import { SAVE_VOTES_FINE_PRINT, SAVE_VOTES_RESEND_LABEL } from '~/core/save-votes-copy';
import { usePrivy } from '~/core/wallet/auth-hooks';
import { requestRealAuth } from '~/core/wallet/auth-store';

import { type AccountStepAnalytics, SIGN_IN_UNAVAILABLE_COPY } from '~/partials/explore/email-capture-account-step';
import { HEADING_CLASS } from '~/partials/explore/email-capture-styles';

import { SIGN_IN_BOX_COPY } from './sign-in-box-copy';
import { CenteredSignInDialog, SignInCard, type SignInCardLabels } from './sign-in-card';

const LABELS: SignInCardLabels = {
  back: 'sign_in_box_back',
  dismiss: 'sign_in_box_dismiss',
  form: 'Sign in box',
  verification: 'Sign in box verification',
};

/** Mounted once, app-wide: the sign-in box for whichever press opened it last. */
export function SignInBoxHost() {
  const request = useSignInBoxRequest();
  // Keyed by attempt, so a new press starts from the email step.
  return request ? <SignInBox key={request.attemptId} request={request} /> : null;
}

/** The save-votes card without votes. Paints before Privy loads; `AccountStep`'s headless calls wait for it. */
function SignInBox({ request }: { request: SignInBoxRequest }) {
  const { authenticated, isModalOpen } = usePrivy();
  // Undefined with the `googleSignIn` flag off or in an in-app browser, which hides the button.
  const google = useContinueWithGoogle();
  const googleStarting = google?.status === 'starting';
  const [email, setEmail] = React.useState(request.prefillEmail ?? '');
  const [step, setStep] = React.useState<{ email: string; phase: 'code' | 'editing' } | null>(null);
  const codeEmail = step?.phase === 'code' ? step.email : null;
  const editing = step?.phase === 'editing';
  const emailInputRef = React.useRef<HTMLInputElement>(null);
  const requestRef = React.useRef(request);
  requestRef.current = request;

  // The box on screen is the prompt being viewed.
  React.useEffect(() => {
    openAuthAttempt(requestRef.current.attribution);
    // After the first paint: Privy loads while the visitor types, so Submit need not wait for it, and
    // the analytics runtime starts so step events reach the collector if the visitor leaves.
    const frame = requestAnimationFrame(() => {
      requestRealAuth();
      startAnalyticsSoon();
    });
    return () => cancelAnimationFrame(frame);
  }, []);

  // The box shows only while its attempt is open. The attempt runs the press's continuation itself.
  React.useEffect(() => {
    const check = () => {
      if (readAuthAttempt(requestRef.current.attemptId)?.endedAt) closeSignInBox(requestRef.current.attemptId);
    };
    check();
    const unsubscribe = subscribeAuthAttempts(check);
    return () => void unsubscribe();
  }, []);

  // Signed in some other way (another tab, a late session restore): withdraw the attempt. A task
  // later, so the box's own sign-in, which ends the attempt as Privy reports it, is seen first.
  React.useEffect(() => {
    if (!authenticated) return;
    const timer = setTimeout(() => {
      cancelPrivyAuthAttempt(requestRef.current.attemptId);
      closeSignInBox(requestRef.current.attemptId);
    }, 0);
    return () => clearTimeout(timer);
  }, [authenticated]);

  // Privy's dialog is the code step's fallback on this attempt, and `PrivyAuthTracker` ends it.
  React.useEffect(() => {
    if (isModalOpen) closeSignInBox(requestRef.current.attemptId);
  }, [isModalOpen]);
  const isModalOpenRef = React.useRef(isModalOpen);
  isModalOpenRef.current = isModalOpen;

  const close = React.useCallback(() => {
    // A Google redirect cannot be aborted; its attempt must survive closing.
    if (!isGoogleSignInStarting()) cancelPrivyAuthAttempt(requestRef.current.attemptId);
    closeSignInBox(requestRef.current.attemptId);
  }, []);

  // Privy never loaded, so no code went out: back to the address, to try again.
  const [unavailable, setUnavailable] = React.useState(false);
  const signInUnavailable = React.useCallback(() => {
    setUnavailable(true);
    setStep(current => (current?.phase === 'code' ? { ...current, phase: 'editing' } : current));
  }, []);

  const changeEmail = React.useCallback(() => {
    if (step?.phase !== 'code') return;
    setEmail(step.email);
    setStep({ ...step, phase: 'editing' });
  }, [step]);

  React.useEffect(() => {
    if (editing) emailInputRef.current?.focus();
  }, [editing]);

  const trimmedEmail = email.trim();
  const canSend = isLikelyEmail(trimmedEmail);

  const submitEmail = (event: React.FormEvent) => {
    event.preventDefault();
    if (!canSend || isGoogleSignInStarting()) return;
    setUnavailable(false);
    setStep({ email: trimmedEmail, phase: 'code' });
  };

  const heading = request.heading ?? SIGN_IN_BOX_COPY.heading;

  return (
    <CenteredSignInDialog title={heading} hidden={false} onClose={close} restoreFocus={() => !isModalOpenRef.current}>
      <SignInCard
        compact={false}
        codeEmail={codeEmail}
        onChangeEmail={changeEmail}
        onClose={close}
        closeLabel={SIGN_IN_BOX_COPY.close}
        labels={LABELS}
        intent="login"
        header={<p className={HEADING_CLASS}>{heading}</p>}
        email={email}
        onEmailChange={setEmail}
        emailInputRef={emailInputRef}
        onSubmitEmail={submitEmail}
        submitDisabled={!canSend || googleStarting}
        submitLabel={editing ? SAVE_VOTES_RESEND_LABEL : SIGN_IN_BOX_COPY.submit}
        google={google}
        onGoogle={() =>
          void google?.start(
            { ...request.attribution, auth_control: 'continue_with_google' },
            { surface: 'box', attemptId: request.attemptId }
          )
        }
        finePrint={SAVE_VOTES_FINE_PRINT}
        analytics={request.attribution as AccountStepAnalytics}
        error={unavailable ? SIGN_IN_UNAVAILABLE_COPY : null}
        onSignInUnavailable={signInUnavailable}
        surface="box"
        attemptId={request.attemptId}
      />
    </CenteredSignInDialog>
  );
}
