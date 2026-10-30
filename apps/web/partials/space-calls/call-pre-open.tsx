'use client';

import * as React from 'react';

import { useDebateGatewayScope } from '~/core/debates/debate-gateway';
import { useGeoChatAuth } from '~/core/debates/hooks';
import { notYetOpenLabel } from '~/core/debates/lobbies/lobby-format';
import type { LobbyPageView } from '~/core/debates/lobbies/lobby-view';
import { useMinuteNow } from '~/core/debates/lobbies/use-minute-now';
import { useAccessControl } from '~/core/hooks/use-access-control';
import { spaceCallSeriesEditPath, spaceCallsTabPath } from '~/core/space-calls/routes';
import { agendaConflictBase, agendaErrorMessage } from '~/core/space-calls/series/call-errors';
import { useSaveCallAgenda } from '~/core/space-calls/series/hooks';
import { useFeatureFlag } from '~/core/state/feature-flags';
import { NavUtils } from '~/core/utils/utils';

import { CallAgenda } from './call-agenda';
import { CallRemind } from './call-remind';
import { PreCallView } from './pre-call-view';

export const SERIES_DEFAULT_AGENDA_NOTE = 'From the series description.';
export const CALLS_PAUSED_LABEL = 'Scheduled calls are paused.';

/**
 * A space call's page before its room opens (GEO-3420), in place of the lobby's not-yet-open card.
 * The lobby page refetches at `opens_at` and swaps in the room.
 */
export function CallPreOpen({ lobby }: { lobby: LobbyPageView }) {
  const call = lobby.call;
  const spaceCalls = useFeatureFlag('spaceCalls');
  const now = useMinuteNow();
  const saveAgenda = useSaveCallAgenda(lobby.lobby_id);
  const { isEditor } = useAccessControl(call?.space_id ?? '');
  const { authenticated } = useGeoChatAuth();
  // Its space's schedule events move or cancel it; signed out, the guest view polls instead.
  useDebateGatewayScope({ scope: 'space', space_id: call?.space_id ?? '' }, authenticated && Boolean(call));
  if (!call) return null;

  const series = call.series ?? null;
  const agenda = call.agenda ?? null;
  const fallback = agenda === null && series?.description ? series.description : null;
  const viewer = call.viewer ?? null;

  return (
    <PreCallView
      name={lobby.name}
      seriesName={series?.name ?? null}
      startsAt={lobby.starts_at}
      endsAt={call.ends_at ?? null}
      spaceName={call.space_name}
      exitHref={spaceCalls ? spaceCallsTabPath(call.space_id) : NavUtils.toSpace(call.space_id)}
      opensLabel={call.held ? CALLS_PAUSED_LABEL : notYetOpenLabel(lobby, now)}
      editHref={spaceCalls && isEditor && series ? spaceCallSeriesEditPath(call.space_id, series.series_id) : null}
      remind={
        <CallRemind
          spaceId={call.space_id}
          callId={lobby.lobby_id}
          seriesId={series && !series.one_off ? series.series_id : null}
          call={viewer?.reminded ?? lobby.viewer.reminded}
          series={viewer?.series_reminded ?? false}
          analyticsLabel="Pre-call remind"
        />
      }
      agenda={
        <CallAgenda
          markdown={agenda?.body ?? fallback ?? ''}
          updatedAt={agenda?.updated_at ?? null}
          note={fallback ? SERIES_DEFAULT_AGENDA_NOTE : null}
          canEdit={viewer?.can_edit_agenda ?? false}
          onSave={(body, base) => saveAgenda.mutateAsync({ body, base_updated_at: base })}
          errorMessage={agendaErrorMessage}
          conflictBase={agendaConflictBase}
        />
      }
    />
  );
}
