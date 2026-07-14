import { IdUtils, SystemIds } from '@geoprotocol/geo-sdk/lite';

import { Effect } from 'effect';
import { notFound, redirect } from 'next/navigation';

import { CALL_SCHEMA, agendaHref } from '~/core/community-calls/constants';
import { bucketOccurrences, getOccurrences } from '~/core/community-calls/occurrences';
import { getEntity } from '~/core/io/queries';

import { AgendaEditor } from '~/partials/community-calls/agenda-editor';

type Props = {
  params: Promise<{ id: string; callId: string }>;
  searchParams: Promise<{ start?: string; end?: string }>;
};

export default async function CommunityCallAgendaPage(props: Props) {
  const params = await props.params;
  const searchParams = await props.searchParams;

  if (!IdUtils.isValid(params.id) || !IdUtils.isValid(params.callId)) {
    notFound();
  }

  const entity = await Effect.runPromise(getEntity(params.callId, params.id));
  if (!entity) {
    notFound();
  }

  const schedule = entity.values.find(v => v.property.id === CALL_SCHEMA.MEETING_TIME_PROPERTY)?.value ?? '';
  const seriesDescription = entity.values.find(v => v.property.id === SystemIds.DESCRIPTION_PROPERTY)?.value ?? '';

  const startMs = Number(searchParams.start);
  const endMs = Number(searchParams.end);

  // No occurrence selected — fall back to the live one, else the next upcoming, else the
  // most recent past occurrence (mirrors curator's own live-then-next-then-most-recent-past
  // fallback). Only 404 when the series has no occurrences at all.
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) {
    const { live, upcoming, past } = bucketOccurrences(getOccurrences(schedule));
    const fallback = live ?? upcoming[0] ?? past[0];
    if (!fallback) notFound();
    redirect(agendaHref(params.id, params.callId, fallback.startMs, fallback.endMs));
  }

  const autoPublishAheadValue = entity.values.find(
    v => v.property.id === CALL_SCHEMA.AUTO_PUBLISH_AHEAD_PROPERTY
  )?.value;

  return (
    <AgendaEditor
      spaceId={params.id}
      callId={params.callId}
      seriesName={entity.name ?? 'Untitled call'}
      seriesDescription={seriesDescription}
      occurrence={{ startMs, endMs }}
      autoPublishAhead={autoPublishAheadValue ? Number(autoPublishAheadValue) : 0}
      schedule={schedule}
    />
  );
}
