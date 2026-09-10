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

  // Gate on the type, not on the schedule (GEO-2816). This used to 404 whenever Meeting Time
  // was missing or empty — which is exactly the state that needs repairing, and the only page
  // that can repair it. A call written with an empty schedule is invisible in every list, so
  // its edit page is the one route back; refusing to open it left the entity stranded with no
  // way to fix or even delete it. `assertScheduleWritable` still refuses to *save* one blank,
  // so admitting it here cannot reintroduce the state it fixes.
  //
  // The type check replaces the accidental filtering the schedule check used to do: without
  // it, any entity id in the URL would open a Community Call form over an unrelated entity.
  if (!entity || !entity.types.some(type => type.id === CALL_SCHEMA.COMMUNITY_CALL_TYPE)) {
    notFound();
  }

  const schedule = entity.values.find(v => v.property.id === CALL_SCHEMA.MEETING_TIME_PROPERTY)?.value ?? '';

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
