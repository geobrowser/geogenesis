'use client';

import { Content, Overlay, Portal, Root, Title } from '@radix-ui/react-dialog';

import * as React from 'react';

import cx from 'classnames';

import { ContinueWithGoogleButton, type useContinueWithGoogle } from '~/core/auth/continue-with-google';
import { Z_LAYER_CLASS } from '~/core/z-layers';

import { ArrowLeft } from '~/design-system/icons/arrow-left';
import { CloseSmall } from '~/design-system/icons/close-small';
import { Mail } from '~/design-system/icons/mail';

import { AccountStep, type AccountStepAnalytics } from '~/partials/explore/email-capture-account-step';
import { HEADING_CLASS } from '~/partials/explore/email-capture-styles';
import {
  CENTERED_CARD_CLASS,
  ICON_BUTTON_CLASS,
  INPUT_CLASS,
  TOP_BAR_CLASS,
  badgeClass,
  bodyClass,
  codeStepClasses,
  errorClass,
  fieldClass,
  fineClass,
  googleButtonClass,
  primaryButtonClass,
} from '~/partials/save-votes/save-votes-styles';

/** `data-geo-analytics-label`s of the card's controls, per surface. */
export type SignInCardLabels = { back: string; dismiss: string; form: string; verification: string };

/** The save-votes card (GEO-3439): email step or code step (`AccountStep` mails the code on mount). The host owns the state. */
export function SignInCard({
  compact,
  codeEmail,
  onChangeEmail,
  onClose,
  closeLabel,
  labels,
  intent,
  header,
  email,
  onEmailChange,
  emailInputRef,
  onSubmitEmail,
  submitDisabled,
  submitLabel,
  google,
  onGoogle,
  finePrint,
  analytics,
}: {
  compact: boolean;
  /** The address a code went to while the code step is up; null on the email step. */
  codeEmail: string | null;
  onChangeEmail: () => void;
  onClose: () => void;
  closeLabel: string;
  labels: SignInCardLabels;
  intent: 'login' | 'signup';
  /** The heading and whatever the host shows under it. */
  header: React.ReactNode;
  email: string;
  onEmailChange: (value: string) => void;
  emailInputRef: React.RefObject<HTMLInputElement | null>;
  onSubmitEmail: (event: React.FormEvent) => void;
  submitDisabled: boolean;
  submitLabel: string;
  /** Undefined where Google is not offered, which hides the button. */
  google: ReturnType<typeof useContinueWithGoogle>;
  onGoogle: () => void;
  finePrint: string;
  /** The code step's attribution. */
  analytics: AccountStepAnalytics;
}) {
  return (
    <div className={bodyClass(compact)}>
      <div className={TOP_BAR_CLASS}>
        {codeEmail !== null ? (
          <button
            type="button"
            onClick={onChangeEmail}
            aria-label="Back to email"
            data-geo-analytics-label={labels.back}
            data-geo-analytics-intent="navigate"
            className={ICON_BUTTON_CLASS}
          >
            <ArrowLeft />
          </button>
        ) : (
          <span aria-hidden className="size-7 mobile:size-11" />
        )}
        <button
          type="button"
          onClick={onClose}
          aria-label={closeLabel}
          data-geo-analytics-label={labels.dismiss}
          data-geo-analytics-intent="dismiss"
          className={ICON_BUTTON_CLASS}
        >
          <CloseSmall />
        </button>
      </div>

      {codeEmail !== null ? (
        <div role="status">
          <div aria-hidden className={badgeClass(compact)}>
            <Mail size={compact ? 20 : 22} />
          </div>
          <p className={HEADING_CLASS}>Check your email</p>
          <AccountStep
            email={codeEmail}
            analytics={analytics}
            analyticsLabel={labels.verification}
            onGiveUp={onClose}
            appearance="save-votes"
            classes={codeStepClasses(compact)}
            onChangeEmail={onChangeEmail}
          />
        </div>
      ) : (
        <form
          data-geo-analytics-label={labels.form}
          data-geo-analytics-intent={intent}
          onSubmit={onSubmitEmail}
          noValidate
        >
          {header}
          <label className={fieldClass(compact)}>
            <span aria-hidden className="shrink-0">
              <Mail size={compact ? 16 : 18} />
            </span>
            <input
              ref={emailInputRef}
              type="text"
              inputMode="email"
              autoComplete="email"
              value={email}
              onChange={event => {
                onEmailChange(event.currentTarget.value);
              }}
              placeholder="your@email.com"
              aria-label="Email address"
              className={INPUT_CLASS}
            />
          </label>
          <button type="submit" disabled={submitDisabled} className={primaryButtonClass(compact)}>
            {submitLabel}
          </button>
          {google ? (
            <ContinueWithGoogleButton
              status={google.status}
              onClick={onGoogle}
              className={googleButtonClass(compact)}
            />
          ) : null}
          {google?.status === 'failed' ? (
            <p role="alert" className={errorClass}>
              Google sign-in did not start. Try again, or use your email.
            </p>
          ) : null}

          <p className={fineClass(compact)}>{finePrint}</p>
        </form>
      )}
    </div>
  );
}

/**
 * The card as a centred modal dialog, a bottom sheet on phones. `hidden` keeps it mounted behind
 * Privy's own dialog, so a code step that is out is not sent again when it comes back.
 */
export function CenteredSignInDialog({
  title,
  hidden,
  onClose,
  restoreFocus,
  children,
}: {
  title: string;
  hidden: boolean;
  onClose: () => void;
  /** Whether closing may hand focus back to what had it; not while Privy's dialog takes over. */
  restoreFocus: () => boolean;
  children: React.ReactNode;
}) {
  /** What had focus when the dialog opened, to hand it back to: it has no Radix trigger. */
  const openerRef = React.useRef<HTMLElement | null>(null);
  return (
    <Root
      open
      onOpenChange={next => {
        if (!next) onClose();
      }}
    >
      <Portal>
        {/* The card inside its backdrop, Radix's own pattern for a centred dialog: a press beside
            the card is then outside the dialog's content, which is what dismisses it. */}
        <Overlay
          hidden={hidden}
          className={cx(
            'fixed inset-0 flex animate-fade-in items-center justify-center bg-text/20 p-4 mobile:items-end mobile:p-0',
            Z_LAYER_CLASS.saveVotesDialog
          )}
        >
          <Content
            aria-describedby={undefined}
            onOpenAutoFocus={() => {
              openerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
            }}
            onCloseAutoFocus={event => {
              // Radix would return focus to a trigger, and there is none.
              event.preventDefault();
              if (restoreFocus()) openerRef.current?.focus();
            }}
            className={cx(CENTERED_CARD_CLASS, 'focus:outline-hidden')}
          >
            <Title className="sr-only">{title}</Title>
            {children}
          </Content>
        </Overlay>
      </Portal>
    </Root>
  );
}
