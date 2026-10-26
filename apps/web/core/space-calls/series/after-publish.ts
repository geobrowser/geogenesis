'use client';

import { dashlessId } from '~/core/debates/api';
import { useGeoChatAuth } from '~/core/debates/hooks';
import { sameId } from '~/core/debates/rooms/room-presence';

import { type SpaceCallsResponse, refreshCallSeries } from '../api';
import { spaceCallsTabPath } from '../routes';
import { type ScheduleOutcome, readScheduleOutcome } from './schedule-outcome';

/** Query params the Calls tab reads to show a just-published series before geo-chat lists it. */
const SERIES_PARAM = 'scheduled';
const OUTCOME_PARAM = 'outcome';
const SCHEDULE_PARAM = 'schedule';

export type ScheduledParams = { seriesId: string; outcome: ScheduleOutcome; schedule: string | null };

export function scheduledCallsTabHref(spaceId: string, params: ScheduledParams) {
  const search = new URLSearchParams({ [SERIES_PARAM]: dashlessId(params.seriesId), [OUTCOME_PARAM]: params.outcome });
  if (params.schedule) search.set(SCHEDULE_PARAM, params.schedule);
  return `${spaceCallsTabPath(spaceId)}?${search}`;
}

export function parseScheduledParams(params: Pick<URLSearchParams, 'get'>): ScheduledParams | null {
  const seriesId = params.get(SERIES_PARAM);
  const outcome = params.get(OUTCOME_PARAM);
  if (!seriesId) return null;
  if (outcome !== 'executed' && outcome !== 'pending' && outcome !== 'unknown') return null;
  return { seriesId, outcome, schedule: params.get(SCHEDULE_PARAM) };
}

/** geo-chat lists the series as published, so the optimistic note can go. */
export function seriesSynced(list: Pick<SpaceCallsResponse, 'series'> | undefined, params: ScheduledParams) {
  const series = list?.series?.find(row => sameId(row.series_id, params.seriesId));
  if (!series) return false;
  return params.schedule === null || series.schedule === params.schedule;
}

/**
 * After a schedule publish (GEO-3420): refreshes geo-chat if the proposal executed and returns the
 * Calls tab href. A failed refresh is left to geo-chat's sweep.
 */
export function useAfterSeriesPublish(spaceId: string) {
  const { accountKey, getPrivyIdentityToken } = useGeoChatAuth();
  return async ({ seriesId, proposalId, schedule }: { seriesId: string; proposalId: string; schedule: string }) => {
    const outcome = await readScheduleOutcome({ spaceId, proposalId });
    if (outcome === 'executed') {
      await refreshCallSeries(
        spaceId,
        { series_id: dashlessId(seriesId), schedule },
        getPrivyIdentityToken,
        accountKey
      ).catch(() => undefined);
    }
    return scheduledCallsTabHref(spaceId, { seriesId, outcome, schedule });
  };
}
