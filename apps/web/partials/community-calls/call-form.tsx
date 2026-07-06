'use client';

import * as React from 'react';

import { useRouter } from 'next/navigation';

import { notifyCommunityCallUpdate, reconcileAutoPublish } from '~/core/community-calls/api';
import { buildCreateCallOps, buildUpdateCallOps } from '~/core/community-calls/call-ops';
import { CALL_SCHEMA } from '~/core/community-calls/constants';
import { useCommunityCallIdentityToken } from '~/core/community-calls/use-identity-token';
import { usePublish } from '~/core/hooks/use-publish';
import { useToast } from '~/core/hooks/use-toast';
import { parseSchedule, serializeSchedule, validateSchedule } from '~/core/utils/schedule';

import { Button } from '~/design-system/button';
import { Select } from '~/design-system/select';

const REPEAT_OPTIONS = [
  { value: 'none', label: 'No repeat' },
  { value: 'DAILY', label: 'Daily' },
  { value: 'WEEKLY', label: 'Weekly' },
  { value: 'BIWEEKLY', label: 'Bi-weekly' },
  { value: 'MONTHLY', label: 'Monthly' },
];

const fieldClass = 'rounded-md border border-grey-02 px-3 py-2 text-metadata';

/** UTC `YYYY-MM-DD` for today, used as the `<input type="date">` floor on new calls. */
function todayUtcDateInput(): string {
  const d = new Date();
  const y = d.getUTCFullYear().toString().padStart(4, '0');
  const m = (d.getUTCMonth() + 1).toString().padStart(2, '0');
  const day = d.getUTCDate().toString().padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export type CallFormInitial = {
  name: string;
  description: string;
  schedule: string;
  autoPublishAhead: number;
};

type Props =
  | { mode: 'create'; spaceId: string }
  | { mode: 'edit'; spaceId: string; callId: string; initial: CallFormInitial };

/** Repeat-select value ('none'/'DAILY'/'WEEKLY'/'BIWEEKLY'/'MONTHLY') for a parsed freq+interval. */
function repeatFromSchedule(freq: string, interval: number): string {
  if (!freq) return 'none';
  if (freq === 'WEEKLY' && interval === 2) return 'BIWEEKLY';
  return freq;
}

/** Author or edit a CommunityCall GRC-20 entity on-chain (dedicated form). */
export function CallForm(props: Props) {
  const router = useRouter();
  const { makeProposal } = usePublish();
  const { getToken } = useCommunityCallIdentityToken();
  const [, setToast] = useToast();
  const { spaceId } = props;
  const initial = props.mode === 'edit' ? props.initial : null;
  const parsedInitial = React.useMemo(() => (initial ? parseSchedule(initial.schedule) : null), [initial]);

  const [name, setName] = React.useState(initial?.name ?? '');
  const [description, setDescription] = React.useState(initial?.description ?? '');
  const [startDate, setStartDate] = React.useState(parsedInitial?.startDate ?? '');
  const [startTime, setStartTime] = React.useState(parsedInitial?.startTime ?? '09:00');
  const [endTime, setEndTime] = React.useState(parsedInitial?.endTime ?? '');
  const [repeat, setRepeat] = React.useState(
    parsedInitial ? repeatFromSchedule(parsedInitial.freq, parsedInitial.interval) : 'none'
  );
  const [autoPublishAhead, setAutoPublishAhead] = React.useState(initial?.autoPublishAhead ?? 0);
  const [submitting, setSubmitting] = React.useState(false);

  const configured = Boolean(CALL_SCHEMA.COMMUNITY_CALL_TYPE && CALL_SCHEMA.MEETING_TIME_PROPERTY);
  const backHref = `/space/${spaceId}/community`;

  const buildSchedule = () => {
    const freq = repeat === 'none' ? '' : repeat === 'BIWEEKLY' ? 'WEEKLY' : repeat;
    const interval = repeat === 'BIWEEKLY' ? 2 : 1;
    return serializeSchedule({ startDate, startTime, endTime, freq, byDay: [], interval });
  };

  const onSubmit = async () => {
    if (!name.trim()) return setToast(<>Add a call name.</>);

    const schedule = buildSchedule();
    const validation = validateSchedule(schedule, { requireFutureStart: props.mode === 'create' });
    if (!validation.valid) return setToast(<>{validation.errors[0]}</>);

    setSubmitting(true);

    if (props.mode === 'edit') {
      const { callId } = props;
      const values = buildUpdateCallOps({ entityId: callId, spaceId, name, description, schedule, autoPublishAhead });

      await makeProposal({
        values,
        relations: [],
        spaceId,
        name: `Update ${name}`,
        onSuccess: async () => {
          // Fire after the write, not before: the update replaces `meetingTime` rather than
          // unsetting it, so curator-backend must read the entity post-write to resend an
          // invite with the *new* schedule — firing earlier would notify subscribers with the
          // stale pre-edit time.
          const notifyToken = await getToken();
          if (notifyToken) await notifyCommunityCallUpdate({ spaceId, callId }, notifyToken).catch(() => {});

          if (autoPublishAhead > 0) {
            const token = await getToken();
            if (token) await reconcileAutoPublish({ spaceId, callId }, token).catch(() => {});
          }
          router.push(backHref);
        },
        onError: () => setSubmitting(false),
      });
      return;
    }

    const { entityId, values, relations } = buildCreateCallOps({
      spaceId,
      name,
      description,
      schedule,
      autoPublishAhead,
    });

    await makeProposal({
      values,
      relations,
      spaceId,
      name: `Schedule ${name}`,
      onSuccess: async () => {
        if (autoPublishAhead > 0) {
          const token = await getToken();
          if (token) await reconcileAutoPublish({ spaceId, callId: entityId }, token).catch(() => {});
        }
        router.push(backHref);
      },
      onError: () => setSubmitting(false),
    });
  };

  return (
    <div className="mx-auto flex max-w-[820px] flex-col gap-4 px-4 py-8">
      <div className="h-[120px] w-full rounded-lg bg-grey-01" />

      <input
        value={name}
        onChange={e => setName(e.target.value)}
        placeholder="Community call name"
        className="text-mainPage outline-none placeholder:text-grey-03"
      />
      <div className="flex items-center gap-2">
        <span className="w-fit rounded bg-grey-01 px-2 py-1 text-metadata text-grey-04">Community call</span>
        <span className="text-metadata text-grey-03">+ type</span>
      </div>

      <input
        value={description}
        onChange={e => setDescription(e.target.value)}
        placeholder="Write content or type / to add a data block…"
        className="text-metadata outline-none placeholder:text-grey-03"
      />

      <div className="flex flex-col gap-4 rounded-lg border border-grey-02 p-4">
        <h3 className="text-smallTitle">Meeting Time</h3>

        <Field label="Start date" chip="Ab">
          <input
            type="date"
            value={startDate}
            onChange={e => setStartDate(e.target.value)}
            min={props.mode === 'create' ? todayUtcDateInput() : undefined}
            className={fieldClass}
          />
        </Field>

        <div className="flex gap-3">
          <Field label="Start time (UTC)" className="flex-1">
            <input type="time" value={startTime} onChange={e => setStartTime(e.target.value)} className={fieldClass} />
          </Field>
          <Field label="End time (UTC)" className="flex-1">
            <input type="time" value={endTime} onChange={e => setEndTime(e.target.value)} className={fieldClass} />
          </Field>
        </div>

        <Field label="Repeat">
          <Select value={repeat} onChange={setRepeat} options={REPEAT_OPTIONS} />
        </Field>

        <Field label="Auto publish ahead" chip="123">
          <input
            type="number"
            min={0}
            max={5}
            value={autoPublishAhead}
            onChange={e => setAutoPublishAhead(Math.max(0, Math.min(5, Number(e.target.value))))}
            className={fieldClass}
            placeholder="Add value…"
          />
        </Field>
      </div>

      {!configured && (
        <p className="text-metadata text-red-01">
          Scheduling is disabled until the curator CommunityCall schema IDs are configured
          (NEXT_PUBLIC_COMMUNITY_CALL_*).
        </p>
      )}

      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={() => router.push(backHref)}>
          Cancel
        </Button>
        <Button variant="primary" disabled={submitting || !configured} onClick={onSubmit}>
          {submitting ? 'Publishing…' : props.mode === 'edit' ? 'Save changes' : 'Schedule call'}
        </Button>
      </div>
    </div>
  );
}

function Field({
  label,
  chip,
  className,
  children,
}: {
  label: string;
  chip?: 'Ab' | '123';
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={`flex flex-col gap-1 ${className ?? ''}`}>
      <div className="flex items-center justify-between">
        <span className="text-metadataMedium">{label}</span>
        {chip && (
          <span className="flex size-5 items-center justify-center rounded bg-grey-01 text-footnote text-grey-04">
            {chip}
          </span>
        )}
      </div>
      {children}
    </div>
  );
}
