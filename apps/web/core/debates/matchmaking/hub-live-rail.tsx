'use client';

import * as React from 'react';

import { usePrivySignIn } from '~/core/hooks/use-privy-sign-in';

import { Text } from '~/design-system/text';

import { useDebateActivity, useGeoChatAuth } from '../hooks';
import { useDebateRequests } from './hooks';
import { HubPillButton } from './hub-pill-button';
import { PeopleTab } from './people-tab';
import { RequestsTab } from './requests-tab';
import { useUnexpiredRequests } from './use-request-countdown';

/**
 * The workspace's right rail: requests and presence, useful while browsing claims.
 */
export function HubLiveRail() {
  const { authenticated, ready } = useGeoChatAuth();

  // Hide Requests when nothing is pending so People sits at the top. Same sources as RequestsTab,
  // including expiry and pending challenges.
  const requestsQuery = useDebateRequests(authenticated);
  const { data: activity } = useDebateActivity(authenticated);
  const incoming = useUnexpiredRequests(requestsQuery.data?.incoming ?? []);
  const outbound = requestsQuery.data?.outbound ?? activity?.outbound_request ?? null;
  const reportedChallenge = activity?.challenge?.status === 'pending' ? activity.challenge : null;
  const liveChallenges = useUnexpiredRequests(
    React.useMemo(() => (reportedChallenge ? [reportedChallenge] : []), [reportedChallenge])
  );
  const hasPendingRequests = incoming.length > 0 || outbound !== null || liveChallenges.length > 0;

  return (
    <div className="flex flex-col gap-6 pb-8" data-testid="hub-live-rail">
      {!ready ? null : authenticated ? (
        <>
          {hasPendingRequests && (
            <RailSection label="Requests">
              <RequestsTab dense />
            </RailSection>
          )}
          <RailSection label="Available now">
            <PeopleTab dense />
          </RailSection>
        </>
      ) : (
        <SignedOutRail />
      )}
    </div>
  );
}

/**
 * Signed out: keep People, and say what Requests would offer.
 */
function SignedOutRail() {
  const promptSignIn = usePrivySignIn();

  return (
    <>
      <section className="flex flex-col gap-2 rounded-lg border border-grey-02 bg-white p-4">
        <Text as="h3" variant="footnoteMedium" color="text">
          Requests
        </Text>
        <Text as="p" variant="footnote" color="grey-04">
          Sign in to see debate requests sent to you.
        </Text>
        <div className="pt-1">
          <HubPillButton onClick={promptSignIn}>Sign in</HubPillButton>
        </div>
      </section>

      <RailSection label="Available now">
        <PeopleTab dense />
      </RailSection>
    </>
  );
}

function RailSection({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <section className="flex min-w-0 flex-col">
      <Text as="h3" variant="footnoteMedium" color="grey-04" className="px-4 pb-1">
        {label}
      </Text>
      {children}
    </section>
  );
}
