'use client';

import { usePrivy } from '@geogenesis/auth';

import * as React from 'react';

import { subscribeToCall } from '~/core/community-calls/api';
import { useCommunityCallIdentityToken } from '~/core/community-calls/use-identity-token';
import { useToast } from '~/core/hooks/use-toast';
import { useReportError } from '~/core/state/status-bar-store';
import { toUserFacingError } from '~/core/utils/error-diagnostics';

import { SmallButton } from '~/design-system/button';

type Props = {
  call: { spaceId: string; callId: string };
  className?: string;
};

/**
 * RSVP-via-email control, shared by the Community tab, explore digest, and space
 * Overview digest. Mirrors curator's `handleSubscribe`/`handleConfirmSubscribe`
 * exactly: a confirm step before sending, and branching on the backend's
 * `{sent, reason}` response rather than assuming success.
 */
export function RsvpButton({ call, className }: Props) {
  'use no memo';

  const { identityToken, getToken } = useCommunityCallIdentityToken();
  const { user } = usePrivy();
  const [, setToast] = useToast();
  const notifyStatusBarError = useReportError();
  const [confirming, setConfirming] = React.useState(false);
  const [busy, setBusy] = React.useState(false);

  const email = user?.email?.address;

  const onClick = () => {
    if (!identityToken) return setToast(<>Sign in to RSVP.</>);
    if (!email) return setToast(<>Add an email to your account to RSVP.</>);
    setConfirming(true);
  };

  const onConfirm = async () => {
    if (!email) return;
    setBusy(true);
    try {
      const token = await getToken();
      if (!token) return setToast(<>Sign in to RSVP.</>);
      const result = await subscribeToCall({ spaceId: call.spaceId, callId: call.callId, email }, token);
      if (result.sent) {
        setToast(<>Calendar invite sent to {email}</>);
      } else if (result.reason === 'already-subscribed') {
        setToast(<>You are already subscribed to this call.</>);
      } else {
        setToast(<>Could not send invite: {result.reason ?? 'unknown error'}</>);
      }
    } catch (err) {
      notifyStatusBarError(toUserFacingError(err, "Couldn't RSVP: ").message);
    } finally {
      setBusy(false);
      setConfirming(false);
    }
  };

  if (confirming) {
    return (
      <div className={`flex items-center gap-2 ${className ?? ''}`}>
        <span className="text-metadata text-text">Send calendar invite to {email}?</span>
        <SmallButton onClick={() => setConfirming(false)} disabled={busy}>
          Cancel
        </SmallButton>
        <SmallButton onClick={onConfirm} disabled={busy}>
          {busy ? 'Sending…' : 'Confirm'}
        </SmallButton>
      </div>
    );
  }

  return (
    <SmallButton className={className} onClick={onClick}>
      RSVP
    </SmallButton>
  );
}
