import { IdUtils } from '@geoprotocol/geo-sdk/lite';

import { Effect } from 'effect';
import { notFound } from 'next/navigation';

import { CALL_SCHEMA } from '~/core/community-calls/constants';
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

  const startMs = Number(searchParams.start);
  const endMs = Number(searchParams.end);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) {
    notFound();
  }

  const entity = await Effect.runPromise(getEntity(params.callId, params.id));
  if (!entity) {
    notFound();
  }

  const autoPublishAheadValue = entity.values.find(
    v => v.property.id === CALL_SCHEMA.AUTO_PUBLISH_AHEAD_PROPERTY
  )?.value;

  return (
    <AgendaEditor
      spaceId={params.id}
      callId={params.callId}
      seriesName={entity.name ?? 'Untitled call'}
      occurrence={{ startMs, endMs }}
      autoPublishAhead={autoPublishAheadValue ? Number(autoPublishAheadValue) : 0}
    />
  );
}
