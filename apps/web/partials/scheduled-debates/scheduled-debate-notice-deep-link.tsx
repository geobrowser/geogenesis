'use client';

import * as React from 'react';

import { useGeoChatAuth } from '~/core/debates/hooks';
import { debateActionAnalyticsAttributes } from '~/core/debates/matchmaking/hub-analytics';
import {
  CANT_MAKE_IT_MODAL,
  SCHEDULED_NOTICE_COPY as COPY,
  RUNNING_LATE_MODAL,
  noticeRequestIdFromTarget,
  toCantMakeIt,
  toRunningLate,
} from '~/core/debates/rooms/scheduled-notice';
import { useDeepLinkEffect, useDeepLinkParams } from '~/core/deep-links/use-deep-link';
import { usePrivySignIn } from '~/core/hooks/use-privy-sign-in';

import { Text } from '~/design-system/text';

import { ScheduledDebateNoticeDialog } from './scheduled-debate-notice';

type Arrival = { requestId: string; step: 'late' | 'cant' };

/**
 * Hosts the emails' Running late and Can't make it links (GEO-3427) from `DeepLinkHandler`.
 *
 * A signed-out debater is asked to sign in straight away, and comes back to the same choice: an
 * existing account by this dialog staying mounted, a new one through onboarding's return to the link
 * itself. The dialog opens behind the sign-in either way, so dismissing it still says what the link
 * was for. Nothing is sent until a press inside the dialog.
 */
export function ScheduledDebateNoticeDeepLink() {
  const late = useDeepLinkParams(RUNNING_LATE_MODAL);
  const cant = useDeepLinkParams(CANT_MAKE_IT_MODAL);
  const [arrival, setArrival] = React.useState<Arrival | null>(null);

  const arrive = (target: string | null, step: Arrival['step']) => {
    const requestId = noticeRequestIdFromTarget(target);
    // A garbled link opens nothing rather than a dialog about no debate.
    if (requestId) setArrival({ requestId, step });
  };
  useDeepLinkEffect({ ...late, run: () => arrive(late.target, 'late') });
  useDeepLinkEffect({ ...cant, run: () => arrive(cant.target, 'cant') });

  if (!arrival) return null;
  // Keyed, so a second link opened while one is up starts on its own step.
  return (
    <SignedInNotice key={`${arrival.step}:${arrival.requestId}`} arrival={arrival} onClose={() => setArrival(null)} />
  );
}

function SignedInNotice({ arrival, onClose }: { arrival: Arrival; onClose: () => void }) {
  const { ready, authenticated } = useGeoChatAuth();
  // Privy renders outside the dialog, and a Radix modal makes everything outside it inert, so the
  // dialog steps aside while Privy is up — as the availability link's does.
  const [signingIn, setSigningIn] = React.useState(false);
  const signIn = usePrivySignIn(() => setSigningIn(false), {
    onError: () => setSigningIn(false),
    // The trigger was cleared on arrival. A new account is sent back here after onboarding, and
    // should land on the same choice.
    redirectTo: arrival.step === 'late' ? toRunningLate(arrival.requestId) : toCantMakeIt(arrival.requestId),
    analytics: {
      component: 'scheduled_debate_notice',
      target_id: arrival.requestId,
      target_type: 'scheduled_debate_request',
      auth_control: arrival.step === 'late' ? 'running_late' : 'cant_make_it',
      auth_trigger: 'deep_link',
      auth_intent: 'join_debate',
      overlay: 'modal',
    },
  });

  const start = React.useCallback(() => {
    setSigningIn(true);
    signIn();
  }, [signIn]);

  // Once, when Privy has said who this is: the email's button press is the press that asks.
  const asked = React.useRef(false);
  React.useEffect(() => {
    if (!ready || authenticated || asked.current) return;
    asked.current = true;
    start();
  }, [ready, authenticated, start]);

  return (
    <ScheduledDebateNoticeDialog
      open={!signingIn}
      requestId={arrival.requestId}
      initialStep={arrival.step}
      onClose={onClose}
    >
      {ready && !authenticated ? (
        <div className="flex flex-col gap-5">
          <Text as="p">{arrival.step === 'late' ? COPY.signIn.late : COPY.signIn.cant}</Text>
          <button
            type="button"
            onClick={start}
            {...debateActionAnalyticsAttributes('scheduled-notice', 'Sign in', 'sign_in_for_scheduled_notice')}
            className="flex h-12 w-full items-center justify-center rounded-full bg-text px-5 text-button text-white transition-opacity hover:opacity-90"
          >
            {COPY.signIn.action}
          </button>
        </div>
      ) : undefined}
    </ScheduledDebateNoticeDialog>
  );
}
