'use client';

import * as React from 'react';

import { type DebateLobbyClaims, type DebateLobbyHighlights, dashlessId } from '../api';
import {
  type AgendaClaimFilter,
  INACTIVE_AGENDA_FILTER,
  useAgendaClaimFilter,
  useAgendaClaimFilterContext,
} from '../todays-claims/agenda-claim-filter';
import { AGENDA_ONLY_LOBBY, AGENDA_ONLY_LOBBY_HOST_LISTS } from '../todays-claims/agenda-only-picker';
import { useDebateLobbyClaims } from './lobby-room-claims-hooks';
import { roomSideOpposing } from './lobby-room-claims-list';

/**
 * GEO-3775. The lobby page's one agenda filter, read once by the room and provided to everything under
 * it (`AgendaClaimFilterContext`), so People's counts and the claims panel narrow by the same answer.
 * Guests too: the agendas are public.
 */
export function useLobbyAgendaFilter(): AgendaClaimFilter {
  return useAgendaClaimFilter(AGENDA_ONLY_LOBBY);
}

/** The filter for what a host picked themselves: their claim lists, highlights and room vote. */
export function useLobbyHostAgendaFilter(): AgendaClaimFilter {
  return hostAgendaFilter(useAgendaClaimFilterContext());
}

/** The lobby's filter as it applies to a host's picks (`AGENDA_ONLY_LOBBY_HOST_LISTS`). */
export function hostAgendaFilter(filter: AgendaClaimFilter): AgendaClaimFilter {
  return AGENDA_ONLY_LOBBY_HOST_LISTS ? filter : INACTIVE_AGENDA_FILTER;
}

/**
 * Highlights and the room vote as an agenda-only lobby draws them, for what marks them as new on a
 * phone: undefined until the agendas answer, so a highlight held back while they load isn't new
 * when it appears.
 */
export function agendaHighlightsState<State extends Pick<DebateLobbyHighlights, 'highlights' | 'room_vote'>>(
  state: State | undefined,
  filter: AgendaClaimFilter
): State | undefined {
  if (!state || !filter.active) return state;
  if (filter.pending || filter.error) return undefined;
  const vote = state.room_vote;
  return {
    ...state,
    highlights: state.highlights.filter(highlight => filter.has(highlight.claim.claim_entity_id)),
    room_vote: vote && filter.has(vote.claim.claim_entity_id) ? vote : null,
  };
}

/**
 * The room's claims with the ones on no agenda taken out, and each person's disagreement count taken
 * again from what is left. geo-chat's counts include claims on no agenda, and it lists at most 8
 * people a side, so a busy claim can leave someone off here: an undercount, never a count of claims
 * the lobby does not show.
 */
export function agendaLobbyClaims(data: DebateLobbyClaims, filter: AgendaClaimFilter): DebateLobbyClaims {
  if (!filter.active) return data;
  const claims = data.claims.filter(row => filter.has(row.claim.claim_entity_id));
  if (!data.disagreements) return { ...data, claims };

  const counts = new Map<string, { user_id: string; claims: number }>();
  for (const row of claims) {
    const viewer = row.viewer_response;
    if (!viewer) continue;
    for (const person of roomSideOpposing(row.positions, viewer.position)?.participants ?? []) {
      const key = dashlessId(person.user_id);
      const entry = counts.get(key) ?? { user_id: person.user_id, claims: 0 };
      entry.claims += 1;
      counts.set(key, entry);
    }
  }
  return { ...data, claims, disagreements: [...counts.values()] };
}

/**
 * `useDebateLobbyClaims`, agenda-only when the lobby is (GEO-3775). Nothing is handed back while the
 * agendas are out, and a failed agenda read is the read's error, with "Try again" asking for the
 * agendas: never the room's claims unfiltered. `filter` is for the room itself, which reads before
 * it provides; everything under it takes the provided one.
 */
export function useLobbyRoomClaims(lobbyId: string, enabled = true, filter?: AgendaClaimFilter) {
  const provided = useAgendaClaimFilterContext();
  const agenda = filter ?? provided;
  const query = useDebateLobbyClaims(lobbyId, enabled);
  const held = agenda.pending || Boolean(agenda.error);
  const data = React.useMemo(
    () => (held || !query.data ? undefined : agendaLobbyClaims(query.data, agenda)),
    [agenda, held, query.data]
  );
  return {
    data,
    isLoading: query.isLoading || (enabled && agenda.pending),
    error: (enabled ? agenda.error : null) || query.error,
    failureReason: query.failureReason,
    refetch: () => {
      if (agenda.error) agenda.refetch();
      else void query.refetch();
    },
  };
}
