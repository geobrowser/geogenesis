import { IdUtils } from '@geoprotocol/geo-sdk/lite';

import { Effect } from 'effect';
import { notFound } from 'next/navigation';

import { CALL_SCHEMA } from '~/core/community-calls/constants';
import { getEntity } from '~/core/io/queries';

import { CallForm } from '~/partials/community-calls/call-form';

type Props = {
  params: Promise<{ id: string; callId: string }>;
};

export default async function EditCommunityCallPage(props: Props) {
  const params = await props.params;

  if (!IdUtils.isValid(params.id) || !IdUtils.isValid(params.callId)) {
    notFound();
  }

  const entity = await Effect.runPromise(getEntity(params.callId, params.id));
  const schedule = entity?.values.find(v => v.property.id === CALL_SCHEMA.MEETING_TIME_PROPERTY)?.value;

  if (!entity || !schedule) {
    notFound();
  }

  const autoPublishAhead = Number(
    entity.values.find(v => v.property.id === CALL_SCHEMA.AUTO_PUBLISH_AHEAD_PROPERTY)?.value ?? 0
  );

  return (
    <CallForm
      mode="edit"
      spaceId={params.id}
      callId={params.callId}
      initial={{
        name: entity.name ?? '',
        description: entity.description ?? '',
        schedule,
        autoPublishAhead: Number.isFinite(autoPublishAhead) ? autoPublishAhead : 0,
      }}
    />
  );
}
