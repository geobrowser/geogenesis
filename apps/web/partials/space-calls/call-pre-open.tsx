'use client';

import * as React from 'react';

import { notYetOpenLabel } from '~/core/debates/lobbies/lobby-format';
import type { LobbyPageView } from '~/core/debates/lobbies/lobby-view';
import { useMinuteNow } from '~/core/debates/lobbies/use-minute-now';
import { spaceCallsTabPath } from '~/core/space-calls/routes';
import { agendaErrorMessage } from '~/core/space-calls/series/call-errors';
import { useSaveCallAgenda } from '~/core/space-calls/series/hooks';
import { useFeatureFlag } from '~/core/state/feature-flags';
import { NavUtils } from '~/core/utils/utils';

import { CallAgenda } from './call-agenda';
import { CallRemind } from './call-remind';
import { PreCallView } from './pre-call-view';

export const SERIES_DEFAULT_AGENDA_NOTE = 'From the series description.';

/**
 * A space call's page before its room opens (GEO-3420), in place of the lobby's not-yet-open card.
 * The lobby page refetches at `opens_at` and swaps in the room.
 */
export function CallPreOpen({ lobby }: { lobby: LobbyPageView }) {
  const call = lobby.call;
  const callSeries = useFeatureFlag('callSeries');
  const now = useMinuteNow();
  const saveAgenda = useSaveCallAgenda(lobby.lobby_id);
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
      exitHref={callSeries ? spaceCallsTabPath(call.space_id) : NavUtils.toSpace(call.space_id)}
      opensLabel={notYetOpenLabel(lobby, now)}
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
          note={fallback ? SERIES_DEFAULT_AGENDA_NOTE : null}
          canEdit={viewer?.can_edit_agenda ?? false}
          onSave={body => saveAgenda.mutateAsync({ body, base_updated_at: agenda?.updated_at ?? null })}
          errorMessage={agendaErrorMessage}
        />
      }
    />
  );
}
