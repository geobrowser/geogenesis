'use client';

import * as React from 'react';

import { usePrivySignIn } from '~/core/hooks/use-privy-sign-in';

import { Text } from '~/design-system/text';

import { useGeoChatAuth } from '../hooks';
import { HubPillButton } from './hub-pill-button';
import { MatchesTab } from './matches-tab';
import { PeopleTab } from './people-tab';
import { RequestsTab } from './requests-tab';

/**
 * The workspace's right rail: the three lists that are only useful *while* you are doing something
 * else, stacked so they stop being modal.
 *
 * Ordered by urgency rather than by the tab order they inherit. A request expires in about 25
 * minutes, so it goes first; matches are pairable now; presence is the slowest of the three. In the
 * panel a request arriving while you read claims is a number on a tab — that is the cost this rail
 * exists to remove.
 *
 * The lists are the panel's own components, unchanged. They keep their own filters and empty
 * states, which is what makes this a second layout rather than a second implementation.
 */
export function HubLiveRail() {
  const { authenticated, ready } = useGeoChatAuth();

  return (
    <div className="flex flex-col gap-6 pb-8" data-testid="hub-live-rail">
      {/* Held until Privy resolves, for the reason the panel's tab row is: `authenticated` is false
          during restoration, so anything drawn before then is the signed-out rail — a returning
          viewer would watch their requests and matches appear a beat later. */}
      {!ready ? null : authenticated ? (
        <>
          <RailSection label="Requests">
            <RequestsTab />
          </RailSection>
          <RailSection label="Matches">
            {/* No tabs to change to out here. The panel's Matches list offers a way over to Claims
                when it is empty; in this layout Claims is already on screen beside it. */}
            <MatchesTab onTabChange={() => {}} />
          </RailSection>
          <RailSection label="Available now">
            <PeopleTab />
          </RailSection>
        </>
      ) : (
        <SignedOutRail />
      )}
    </div>
  );
}

/**
 * Signed out the rail loses two of its three lists, so it says what they are rather than showing
 * two empty headings.
 *
 * People stays because presence is a fact about other people rather than about the viewer, and it
 * is the one list that still answers — so the rail leads with the thing that works and explains the
 * two that need an account, instead of being wholly a prompt.
 */
function SignedOutRail() {
  const promptSignIn = usePrivySignIn();

  return (
    <>
      <section className="flex flex-col gap-2 rounded-lg border border-grey-02 bg-white p-4">
        <Text as="h3" variant="footnoteMedium" color="text">
          Requests and matches
        </Text>
        <Text as="p" variant="footnote" color="grey-04">
          Sign in to be paired with someone who disagrees, and to see debate requests sent to you.
        </Text>
        <div className="pt-1">
          <HubPillButton onClick={promptSignIn}>Sign in</HubPillButton>
        </div>
      </section>

      <RailSection label="Available now">
        <PeopleTab />
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
