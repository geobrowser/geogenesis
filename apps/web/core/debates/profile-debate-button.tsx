'use client';

import * as React from 'react';

import { Text } from '~/design-system/text';

import { useCreateDebateChallenge, useDebateActivity, useDebateProfile } from './hooks';
import { useDebateRequests } from './matchmaking/hooks';
import { useOutboundDebateChallenge } from './matchmaking/use-outbound-debate-challenge';
import { RequestBlockedReasonTooltip } from './request-blocked-reason-tooltip';
import { PENDING_OUTBOUND_REQUEST_REASON } from './request-gate';
import { useCurrentGeoChatUserId } from './use-current-geo-chat-user-id';

/**
 * Challenges the owner of a personal space to a debate with no claim attached.
 * The server's `can_challenge` decides whether the button shows: that person is
 * available and neither side is mid-flow. `DebateCoordinator` owns the request dialog.
 */
export function ProfileDebateButton({ spaceId }: { spaceId: string }) {
  const profileQuery = useDebateProfile(spaceId);
  const { data: activity } = useDebateActivity();
  // The request list is authoritative for claim requests while this control is visible. It must be
  // enabled rather than cache-only: `debate.requests_changed` invalidates this key when a request
  // ends, and a disabled observer would keep gating on its stale outbound row indefinitely.
  const { data: requests } = useDebateRequests(profileQuery.data?.can_challenge === true);
  const currentUserId = useCurrentGeoChatUserId();
  const { outboundChallenge, outboundChallengeDirectionUnknown } = useOutboundDebateChallenge(activity, currentUserId);
  const createChallenge = useCreateDebateChallenge();

  if (!profileQuery.data?.can_challenge) return null;

  const error = createChallenge.error instanceof Error ? createChallenge.error.message : null;
  const blockedReason =
    requests?.outbound || activity?.outbound_request || outboundChallenge || outboundChallengeDirectionUnknown
      ? PENDING_OUTBOUND_REQUEST_REASON
      : null;

  const button = (
    <button
      type="button"
      onClick={() => createChallenge.mutate({ recipient_profile_space_id: spaceId })}
      disabled={createChallenge.isPending || Boolean(blockedReason)}
      // nowrap for the same reason as HubPillButton: `h-7` is fixed, and this sits at the end of
      // the profile name row, so a long name squeezes it until the label wraps out of the pill.
      // `shrink-0` does not help here — the wrapper is `flex-col`, so it governs height, not width.
      className="inline-flex h-7 shrink-0 items-center rounded-full bg-text px-2.5 text-metadata whitespace-nowrap text-white transition-colors hover:bg-text/90 disabled:opacity-50"
    >
      {createChallenge.isPending ? 'Requesting...' : 'Request debate'}
    </button>
  );

  return (
    <div className="flex flex-col items-end gap-1">
      {blockedReason ? <RequestBlockedReasonTooltip reason={blockedReason} trigger={button} /> : button}
      {error && (
        <Text as="p" variant="footnote" color="red-01">
          {error}
        </Text>
      )}
    </div>
  );
}
