'use client';

import { SystemIds } from '@geoprotocol/geo-sdk/lite';
import { useQuery } from '@tanstack/react-query';

import * as React from 'react';

import { formatInTimeZone } from 'date-fns-tz';
import { Effect } from 'effect';
import { useRouter } from 'next/navigation';
import Textarea from 'react-textarea-autosize';

import { parseAgendaText } from '~/core/community-calls/agenda';
import { notifyCommunityCallUpdate, reconcileAutoPublish } from '~/core/community-calls/api';
import { buildCreateCallOps, buildUpdateCallOps } from '~/core/community-calls/call-ops';
import { CALL_SCHEMA } from '~/core/community-calls/constants';
import { useCommunityCallIdentityToken } from '~/core/community-calls/use-identity-token';
import { usePublish } from '~/core/hooks/use-publish';
import { useToast } from '~/core/hooks/use-toast';
import { getRelationsByFromEntityId } from '~/core/io/queries';
import { renderMarkdownDocument } from '~/core/state/editor/markdown-render';
import { parseSchedule, serializeSchedule, tzAbbreviation, validateSchedule } from '~/core/utils/schedule';

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

/** `YYYY-MM-DD` for "today" in `tz`, used as the `<input type="date">` floor on new calls —
 *  the organizer's local calendar date, not UTC's (which can be a day off near midnight). */
function todayDateInput(tz: string): string {
  return formatInTimeZone(new Date(), tz, 'yyyy-MM-dd');
}

export type CallFormInitial = {
  name: string;
  description: string;
  schedule: string;
  autoPublishAhead: number;
};

type Props =
  { mode: 'create'; spaceId: string } | { mode: 'edit'; spaceId: string; callId: string; initial: CallFormInitial };

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
  const editCallId = props.mode === 'edit' ? props.callId : null;
  const parsedInitial = React.useMemo(() => (initial ? parseSchedule(initial.schedule) : null), [initial]);
  // Relation objects only — the block text itself is already in `initial.description`, so
  // there's no need to fetch each TEXT_BLOCK entity's content just to tombstone them on save.
  const { data: existingBlockRelations = [] } = useQuery({
    queryKey: ['community-call-description-blocks', spaceId, editCallId],
    queryFn: () =>
      Effect.runPromise(getRelationsByFromEntityId(editCallId!, SystemIds.BLOCKS, spaceId)).catch(() => []),
    enabled: Boolean(editCallId),
  });
  // Every schedule this form writes carries the organizer's own zone (upgrading a legacy
  // no-TZID schedule to TZID on next save) rather than the zone it happened to be created in.
  const browserTimezone = React.useMemo(() => Intl.DateTimeFormat().resolvedOptions().timeZone, []);
  const zoneLabel = React.useMemo(() => tzAbbreviation(browserTimezone, Date.now()), [browserTimezone]);

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
    return serializeSchedule({ startDate, startTime, endTime, freq, byDay: [], interval, timezone: browserTimezone });
  };

  const onSubmit = async () => {
    if (!name.trim()) return setToast(<>Add a call name.</>);

    const schedule = buildSchedule();
    const validation = validateSchedule(schedule, { requireFutureStart: props.mode === 'create' });
    if (!validation.valid) return setToast(<>{validation.errors[0]}</>);

    setSubmitting(true);

    if (props.mode === 'edit') {
      const { callId } = props;
      const { values, relations } = buildUpdateCallOps({
        entityId: callId,
        spaceId,
        name,
        description,
        schedule,
        autoPublishAhead,
        existingBlockRelations,
      });

      await makeProposal({
        values,
        relations,
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

      <DescriptionEditor description={description} onChange={setDescription} />

      <div className="flex flex-col gap-4 rounded-lg border border-grey-02 p-4">
        <h3 className="text-smallTitle">Meeting Time</h3>

        <Field label="Start date" chip="Ab">
          <input
            type="date"
            value={startDate}
            onChange={e => setStartDate(e.target.value)}
            min={props.mode === 'create' ? todayDateInput(browserTimezone) : undefined}
            className={fieldClass}
          />
        </Field>

        <div className="flex gap-3">
          <Field label={`Start time (${zoneLabel})`} className="flex-1">
            <input type="time" value={startTime} onChange={e => setStartTime(e.target.value)} className={fieldClass} />
          </Field>
          <Field label={`End time (${zoneLabel})`} className="flex-1">
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

/** Side-by-side markdown textarea + live preview — description blocks split the same
 *  way the agenda editor's do (blank-line-separated), see `parseAgendaText`. */
function DescriptionEditor({ description, onChange }: { description: string; onChange: (next: string) => void }) {
  const blocks = React.useMemo(() => parseAgendaText(description), [description]);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-metadataMedium">Description</span>
        {blocks.length > 0 && (
          <span className="text-footnote text-grey-03">
            {blocks.length} block{blocks.length === 1 ? '' : 's'}
          </span>
        )}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Textarea
          value={description}
          onChange={e => onChange(e.target.value)}
          minRows={6}
          placeholder="Write content or type / to add a data block…"
          className="w-full resize-none rounded-lg border border-grey-02 p-3 text-metadata outline-none placeholder:text-grey-03"
        />
        <div className="flex flex-col gap-3 overflow-y-auto rounded-lg border border-grey-02 p-3">
          {blocks.length === 0 ? (
            <span className="text-metadata text-grey-03">Preview</span>
          ) : (
            blocks.map((block, i) => (
              <div key={i} className="text-metadata text-text">
                {renderMarkdownDocument(block.markdown)}
              </div>
            ))
          )}
        </div>
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
