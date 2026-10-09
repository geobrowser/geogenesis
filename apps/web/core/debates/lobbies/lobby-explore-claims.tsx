'use client';

import { Text } from '~/design-system/text';

import type { LobbyPageView } from './lobby-view';

/**
 * The lobby's "Explore" claims tab. Placeholder: replace this component's body with the existing
 * claim browser (space and topic filters, `MatchmakingClaimCard`).
 */
export function LobbyExploreClaims(_props: { lobby: LobbyPageView }) {
  return (
    <Text as="p" variant="metadata" color="grey-04" data-testid="lobby-explore-placeholder">
      Explore claims is coming soon.
    </Text>
  );
}
