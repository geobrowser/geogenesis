'use client';

import { usePrivy } from '@geogenesis/auth';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import * as React from 'react';

import { getSubscriptionStatus, subscribeToCall } from '~/core/community-calls/api';
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
 * How each backend RSVP state reads on the button. A state that's absent here (or a
 * null `rsvpStatus`) leaves the button actionable — that covers both "never invited"
 * and `declined`, since a user who declined should be able to RSVP again.
 *
 * `pending` is the state every invite starts in; it only becomes `accepted` once the
 * user accepts the .ics in their mail client and rendezvous processes the inbound
 * iMIP reply. Most users never do that, so `pending` still has to read as a
 * successful RSVP — same rule the onboarding checklist applies.
 */
const RSVP_LABEL: Record<string, string> = {
  pending: 'Invite sent',
  accepted: 'Going',
  tentative: 'Maybe',
};

/**
 * RSVP-via-email control, shared by the Community tab, explore digest, and space
 * Overview digest. Mirrors curator's `handleSubscribe`/`handleConfirmSubscribe`
 * exactly: a confirm step before sending, and branching on the backend's
 * `{sent, reason}` response rather than assuming success.
 *
 * Reflects the user's existing RSVP for the call, so a returning user sees their
 * state instead of a button that re-offers something they already did.
 */
export function RsvpButton({ call, className }: Props) {
  'use no memo';

  const { identityToken, getToken } = useCommunityCallIdentityToken();
  const { user } = usePrivy();
  const [, setToast] = useToast();
  const notifyStatusBarError = useReportError();
  const queryClient = useQueryClient();
  const [confirming, setConfirming] = React.useState(false);
  const [busy, setBusy] = React.useState(false);

  const email = user?.email?.address;

  const { data: status } = useQuery({
    queryKey: ['community-call-rsvp-status', call.spaceId, call.callId],
    enabled: Boolean(identityToken),
    staleTime: 60_000,
    queryFn: async () => {
      const token = await getToken();
      if (!token) return null;
      return getSubscriptionStatus({ spaceId: call.spaceId, callId: call.callId }, token);
    },
  });

  const rsvpLabel = status?.rsvpStatus ? RSVP_LABEL[status.rsvpStatus] : undefined;

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
      // Refetch on both success and `already-subscribed` — either way the button is
      // now out of date. The onboarding checklist reads the same RSVP from its own
      // endpoint, so its "RSVP to a community call" step has to be re-run too.
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['community-call-rsvp-status', call.spaceId, call.callId] }),
        queryClient.invalidateQueries({ queryKey: ['curator-onboarding-status'] }),
      ]);
    } catch (err) {
      notifyStatusBarError(toUserFacingError(err, "Couldn't RSVP: ").message);
    } finally {
      setBusy(false);
      setConfirming(false);
    }
  };

  // Checked before `rsvpLabel` so a background refetch can't yank the prompt out from
  // under a user who is mid-confirm.
  if (confirming) {
    // Column, not a row: every caller drops this into a cramped horizontal action
    // slot, so keeping the prompt and its buttons on one line pushes them out of the card.
    return (
      <div className={`flex min-w-0 flex-col items-end gap-2 ${className ?? ''}`}>
        <span className="text-right text-metadata [overflow-wrap:anywhere] break-words text-text">
          Send calendar invite to {email}?
        </span>
        <div className="flex shrink-0 items-center gap-2">
          <SmallButton onClick={() => setConfirming(false)} disabled={busy}>
            Cancel
          </SmallButton>
          <SmallButton onClick={onConfirm} disabled={busy}>
            {busy ? 'Sending…' : 'Confirm'}
          </SmallButton>
        </div>
      </div>
    );
  }

  if (rsvpLabel) {
    return (
      <SmallButton className={className} disabled>
        {rsvpLabel}
      </SmallButton>
    );
  }

  return (
    <SmallButton className={className} onClick={onClick}>
      RSVP
    </SmallButton>
  );
}
