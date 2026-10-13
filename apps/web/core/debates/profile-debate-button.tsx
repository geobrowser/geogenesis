'use client';

import * as React from 'react';

import { Text } from '~/design-system/text';

import { DebateRequestSurface } from './debate-request-surface';
import { useCreateDebateChallenge, useDebateProfile } from './hooks';
import { debateActionAnalyticsAttributes } from './matchmaking/hub-analytics';

/**
 * Challenges the owner of a personal space to a debate with no claim attached.
 * The server's `can_challenge` decides whether the button shows: that person is
 * available and neither side is mid-flow. `DebateCoordinator` owns the request dialog.
 */
export function ProfileDebateButton({ spaceId }: { spaceId: string }) {
  // Outside the button, so the challenge hook inside reads it (GEO-3244).
  return (
    <DebateRequestSurface surface="profile">
      <ProfileDebateButtonInner spaceId={spaceId} />
    </DebateRequestSurface>
  );
}

function ProfileDebateButtonInner({ spaceId }: { spaceId: string }) {
  const profileQuery = useDebateProfile(spaceId);
  const createChallenge = useCreateDebateChallenge();

  if (!profileQuery.data?.can_challenge) return null;

  const error = createChallenge.error instanceof Error ? createChallenge.error.message : null;

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={() => createChallenge.mutate({ recipient_profile_space_id: spaceId })}
        disabled={createChallenge.isPending}
        {...debateActionAnalyticsAttributes('profile', 'Request debate', 'start_debate')}
        // nowrap for the same reason as HubPillButton: `h-7` is fixed, and this sits at the end of
        // the profile name row, so a long name squeezes it until the label wraps out of the pill.
        // `shrink-0` does not help here — the wrapper is `flex-col`, so it governs height, not width.
        className="inline-flex h-7 shrink-0 items-center rounded-full bg-text px-2.5 text-metadata whitespace-nowrap text-white transition-colors hover:bg-text/90 disabled:opacity-50"
      >
        {createChallenge.isPending ? 'Requesting...' : 'Request debate'}
      </button>
      {error && (
        <Text as="p" variant="footnote" color="red-01">
          {error}
        </Text>
      )}
    </div>
  );
}
