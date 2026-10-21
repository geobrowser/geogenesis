'use client';

import * as React from 'react';

import { usePathname, useSearchParams } from 'next/navigation';

import { withActionContext } from '~/core/action-context';
import { useActionContext } from '~/core/action-context-provider';
import { equals } from '~/core/id/normalize';
import { usePendingPersonalSpace } from '~/core/state/pending-personal-space';
import { openSaveVotesPrompt } from '~/core/state/save-votes-prompt';
import { usePrivy } from '~/core/wallet/auth-hooks';

import {
  markEmailVoteLinkHandled,
  readEmailVoteLink,
  urlWithoutEmailVote,
  wasEmailVoteLinkHandled,
} from './email-vote-link';

/** What the link did, for the note under the pill. */
export type EmailVoteOutcome =
  /** The link's side was cast. */
  | { kind: 'cast'; position: boolean }
  /** The reader already held a side, which the link leaves alone. */
  | { kind: 'kept'; position: boolean };

/**
 * Casts the side an email's vote link carries, once, on the claim page (GEO-3374).
 *
 * Through the page's own position control, so the vote takes exactly the path a press on the pill
 * does: published for a signed-in account, queued for one whose space is still being made, and kept
 * on the device for a visitor who is signed out — who then gets the save sheet asking them to log in.
 *
 * Never changes a side the reader already holds, whether the account holds it or this device does.
 */
export function useEmailVoteLink({
  claimId,
  spaceId,
  viewerPosition,
  answersReady,
  canRespond,
  isConnected,
  respond,
}: {
  claimId: string;
  spaceId: string;
  /** The side drawn as the reader's: the account's, a queued one, or this device's. */
  viewerPosition: boolean | null;
  /** The claim's kind and the reader's own side have both arrived. */
  answersReady: boolean;
  /** The pills are live: nothing blocks responding to this claim. */
  canRespond: boolean;
  isConnected: boolean;
  respond: (position: boolean) => void;
}): EmailVoteOutcome | null {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const link = readEmailVoteLink(searchParams);
  // Only the claim the page is for. `ClaimPageView` also renders in the side panel, over a page whose
  // URL belongs to whatever is underneath it.
  const forThisClaim = link !== null && (pathname ?? '').split('/').some(segment => equals(segment, claimId));

  const { ready: authReady, authenticated } = usePrivy();
  const { isPending: isAccountSetupPending } = usePendingPersonalSpace();
  const getContext = useActionContext('claim_position_control', 'claim', claimId);

  // When a press would mean what it says. Signed out, at once: the side goes on the device. Signed in,
  // once the reader's own side is known — before then "holds none" is only a loading default — and the
  // account can publish or queue. A session still restoring waits: it is a returning account's.
  const signedOut = authReady && !authenticated;
  const canDecide = canRespond && (signedOut || (authReady && answersReady && (isConnected || isAccountSetupPending)));

  const [outcome, setOutcome] = React.useState<EmailVoteOutcome | null>(null);
  const handledRef = React.useRef(false);
  const latest = React.useRef({ viewerPosition, respond, getContext, link, signedOut });
  latest.current = { viewerPosition, respond, getContext, link, signedOut };

  React.useEffect(() => {
    if (!forThisClaim || handledRef.current || !canDecide) return;
    handledRef.current = true;
    const { viewerPosition, respond, getContext, link, signedOut } = latest.current;
    if (!link) return;

    // Cleared first, whatever happens next: left in the address bar it fires again on refresh.
    window.history.replaceState(
      null,
      '',
      urlWithoutEmailVote(window.location.pathname, new URLSearchParams(window.location.search), window.location.hash)
    );

    if (viewerPosition !== null) {
      setOutcome({ kind: 'kept', position: viewerPosition });
      markEmailVoteLinkHandled(claimId, spaceId);
      return;
    }
    // Opened before, and the vote it cast has since been taken back or hasn't indexed yet.
    if (wasEmailVoteLinkHandled(claimId, spaceId)) return;
    markEmailVoteLinkHandled(claimId, spaceId);

    // The email the vote came from rides on its analytics, published or kept on the device.
    const context = getContext();
    withActionContext(link.refEmail ? { ...context, ref_email: link.refEmail } : context, () => respond(link.position));
    setOutcome({ kind: 'cast', position: link.position });
    // The pill's own ask may already be open with sign-up wording; this reader has an account.
    if (signedOut) openSaveVotesPrompt('email_link');
  }, [canDecide, claimId, forThisClaim, spaceId]);

  return outcome;
}
