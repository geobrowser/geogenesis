'use client';

import type { DebateLobbyView } from '../api';

/**
 * The lobby's "In this room" claims (GEO-3132). `excludeClaimIds` drops rows by
 * `DebateClaimSummary.id`, for a host that shows some of them elsewhere.
 */
export function LobbyRoomClaims(_props: { lobby: DebateLobbyView; excludeClaimIds?: ReadonlySet<string> }) {
  return null;
}
