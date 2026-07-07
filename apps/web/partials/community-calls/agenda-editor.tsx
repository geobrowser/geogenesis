'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';

import * as React from 'react';

import { formatInTimeZone } from 'date-fns-tz';
import Textarea from 'react-textarea-autosize';

import { parseAgendaText, serializeAgendaBlocks } from '~/core/community-calls/agenda';
import {
  deleteOccurrenceDraft,
  getOccurrenceDraft,
  reconcileAutoPublish,
  upsertOccurrenceDraft,
} from '~/core/community-calls/api';
import { buildDeleteOccurrenceOps, buildPublishOccurrenceOps } from '~/core/community-calls/call-ops';
import { LIVE_MEETING_GRACE_MINUTES, agendaHref } from '~/core/community-calls/constants';
import { fetchOccurrenceEvent } from '~/core/community-calls/fetch-occurrence-event';
import { formatDateLabel, formatTimeRange } from '~/core/community-calls/format';
import { Occurrence, OccurrenceAgendaBlock } from '~/core/community-calls/types';
import { useCommunityCallIdentityToken } from '~/core/community-calls/use-identity-token';
import { useAccessControl } from '~/core/hooks/use-access-control';
import { usePublish } from '~/core/hooks/use-publish';
import { useToast } from '~/core/hooks/use-toast';
import { renderMarkdownDocument } from '~/core/state/editor/markdown-render';
import {
  MAX_CALL_DURATION_MINUTES,
  MIN_CALL_DURATION_MINUTES,
  localToUtcMs,
  tzAbbreviation,
} from '~/core/utils/schedule';

import { Button, SmallButton } from '~/design-system/button';

import { OccurrenceSelector } from './occurrence-selector';

type Status = 'predicted' | 'draft' | 'published' | 'unpublished';

const SAVE_DEBOUNCE_MS = 1000;
const DELETE_DRAFT_RETRIES = 2;

/** `YYYY-MM-DD` for a `<input type="date">`, in `tz`. */
function msToDateInput(ms: number, tz: string): string {
  return formatInTimeZone(ms, tz, 'yyyy-MM-dd');
}

/** `HH:MM` for a `<input type="time">`, in `tz`. */
function msToTimeInput(ms: number, tz: string): string {
  return formatInTimeZone(ms, tz, 'HH:mm');
}

/** Local wall-clock digits in `tz` to a true UTC instant — DST-aware, see `localToUtcMs`. */
function dateTimeInputToMs(dateStr: string, timeStr: string, tz: string): number | null {
  if (!dateStr || !timeStr) return null;
  const [y, m, d] = dateStr.split('-').map(Number);
  const [h, min] = timeStr.split(':').map(Number);
  if (![y, m, d, h, min].every(Number.isFinite)) return null;
  return localToUtcMs(Date.UTC(y, m - 1, d, h, min), tz);
}

async function deleteDraftBestEffort(
  args: { spaceId: string; callId: string; occurrenceStart: number },
  token: string
) {
  for (let attempt = 0; attempt <= DELETE_DRAFT_RETRIES; attempt++) {
    try {
      await deleteOccurrenceDraft(args, token);
      return;
    } catch {
      // best-effort — an orphaned draft just means the next visit re-reads a stale copy
    }
  }
}

export function AgendaEditor({
  spaceId,
  callId,
  seriesName,
  occurrence,
  autoPublishAhead,
  schedule,
}: {
  spaceId: string;
  callId: string;
  seriesName: string;
  occurrence: Occurrence;
  /** Series' `Auto publish ahead` setting — a republish nudge is only useful when it's > 0. */
  autoPublishAhead: number;
  schedule: string;
}) {
  const { isEditor, isLoading: accessLoading } = useAccessControl(spaceId);
  const { identityToken, getToken } = useCommunityCallIdentityToken();
  const { makeProposal } = usePublish();
  const [, setToast] = useToast();
  const queryClient = useQueryClient();
  const browserTimezone = React.useMemo(() => Intl.DateTimeFormat().resolvedOptions().timeZone, []);
  const zoneLabel = React.useMemo(() => tzAbbreviation(browserTimezone, Date.now()), [browserTimezone]);

  const pastGrace = Date.now() > occurrence.endMs + LIVE_MEETING_GRACE_MINUTES * 60 * 1000;
  const notYetStarted = Date.now() < occurrence.startMs;

  const eventQueryKey = ['community-call-occurrence-event', spaceId, callId, occurrence.startMs];
  const { data: publishedEvent, isFetched: publishedFetched } = useQuery({
    queryKey: eventQueryKey,
    queryFn: () => fetchOccurrenceEvent(callId, spaceId, occurrence.startMs),
  });

  // Only lock once a draft is both past grace AND already published — otherwise an
  // occurrence that never got published becomes permanently unsavable/unpublishable the
  // moment grace elapses, with no way to recover it. Matches curator's own lock condition.
  const locked = pastGrace && Boolean(publishedEvent);

  // Drafts only exist for an editor composing an unpublished/in-progress occurrence — everyone
  // else (locked occurrences, non-editors, or before access-control resolves) has no draft to
  // wait for.
  const draftEnabled = isEditor && Boolean(identityToken) && !locked;

  const { data: draft, isFetched: draftFetched } = useQuery({
    queryKey: ['community-call-occurrence-draft', spaceId, callId, occurrence.startMs],
    queryFn: async () => {
      const token = await getToken();
      if (!token) return null;
      return getOccurrenceDraft({ spaceId, callId, occurrenceStart: occurrence.startMs }, token).catch(() => null);
    },
    enabled: draftEnabled,
  });

  const [text, setText] = React.useState<string | null>(null);
  const [startOverride, setStartOverride] = React.useState<number | null>(null);
  const [endOverride, setEndOverride] = React.useState<number | null>(null);
  const [publishing, setPublishing] = React.useState(false);
  const [savingDraft, setSavingDraft] = React.useState(false);
  const [deleting, setDeleting] = React.useState(false);
  const [confirmingDelete, setConfirmingDelete] = React.useState(false);
  const initializedRef = React.useRef(false);

  const effectiveStart = startOverride ?? occurrence.startMs;
  const effectiveEnd = endOverride ?? occurrence.endMs;
  const rescheduled = startOverride !== null || endOverride !== null;

  // Curator enforces the same bounds inline and disables Save/Publish on violation —
  // only relevant once the occurrence has actually been rescheduled away from its
  // predicted RRULE slot, which is already duration-valid by construction.
  const rescheduleError = React.useMemo(() => {
    if (!rescheduled) return null;
    if (effectiveStart <= Date.now()) return 'Start time must be in the future.';
    const durationMinutes = (effectiveEnd - effectiveStart) / 60_000;
    if (durationMinutes < MIN_CALL_DURATION_MINUTES)
      return `Call must be at least ${MIN_CALL_DURATION_MINUTES} minutes long.`;
    if (durationMinutes > MAX_CALL_DURATION_MINUTES) {
      const h = Math.floor(MAX_CALL_DURATION_MINUTES / 60);
      const m = MAX_CALL_DURATION_MINUTES % 60;
      return `Call can't be longer than ${h}h${m ? ` ${m}m` : ''}.`;
    }
    return null;
  }, [rescheduled, effectiveStart, effectiveEnd]);

  const publishedText = React.useCallback(() => {
    if (!publishedEvent) return '';
    return serializeAgendaBlocks(
      publishedEvent.blocks.map(b => ({ name: '', markdown: b.markdown, position: b.position }))
    );
  }, [publishedEvent]);

  // Seed the textarea once from whichever source has content: an in-progress draft
  // takes priority over the last-published agenda, since it represents newer edits.
  // Only wait on the draft query when it's actually going to run — otherwise (locked
  // occurrence, non-editor, or access-control still resolving) this would hang on
  // "Loading agenda…" forever, since a disabled query's `isFetched` never turns true.
  React.useEffect(() => {
    if (initializedRef.current) return;
    if (accessLoading || !publishedFetched) return;
    if (draftEnabled && !draftFetched) return;
    const draftText = draft?.agendaBlocks?.length ? serializeAgendaBlocks(draft.agendaBlocks) : '';
    setText(draftText || publishedText());
    setStartOverride(draft?.startOverride ?? null);
    setEndOverride(draft?.endOverride ?? null);
    initializedRef.current = true;
  }, [draft, draftFetched, draftEnabled, accessLoading, publishedFetched, publishedText]);

  const status: Status = React.useMemo(() => {
    if (text === null) return 'predicted';
    const trimmed = text.trim();
    if (!trimmed) return publishedEvent ? 'unpublished' : 'predicted';
    if (!publishedEvent) return 'draft';
    return trimmed === publishedText().trim() ? 'published' : 'unpublished';
  }, [text, publishedEvent, publishedText]);

  const saveTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  // The last debounced-but-not-yet-sent payload — read by the unmount/beforeunload
  // guards below so an in-app navigation or tab close can't silently drop it.
  const pendingPayloadRef = React.useRef<{
    agendaBlocks: OccurrenceAgendaBlock[];
    startOverride: number | null;
    endOverride: number | null;
  } | null>(null);

  const flushSave = React.useCallback(
    async (payload: {
      agendaBlocks: OccurrenceAgendaBlock[];
      startOverride: number | null;
      endOverride: number | null;
    }) => {
      const token = await getToken();
      if (!token) return;
      setSavingDraft(true);
      await upsertOccurrenceDraft({ spaceId, callId, occurrenceStart: occurrence.startMs, ...payload }, token).catch(
        () => {}
      );
      setSavingDraft(false);
      pendingPayloadRef.current = null;
    },
    [spaceId, callId, occurrence.startMs, getToken]
  );

  const scheduleSave = (args: { text: string; startOverride: number | null; endOverride: number | null }) => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    const payload = {
      agendaBlocks: parseAgendaText(args.text),
      startOverride: args.startOverride,
      endOverride: args.endOverride,
    };
    pendingPayloadRef.current = payload;
    saveTimerRef.current = setTimeout(() => flushSave(payload), SAVE_DEBOUNCE_MS);
  };

  // Curator blocks in-app navigation outright on unsaved changes via `useBlocker` +
  // `beforeunload`; Next.js App Router has no equivalent route-block hook. Instead of
  // literally replicating the block, close the same data-loss window: flush any pending
  // debounced save immediately when this page unmounts (no state updates here, the
  // component is already gone), and warn on tab-close/refresh while a save is pending.
  React.useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      const payload = pendingPayloadRef.current;
      if (!payload) return;
      getToken().then(token => {
        if (!token) return;
        upsertOccurrenceDraft({ spaceId, callId, occurrenceStart: occurrence.startMs, ...payload }, token).catch(
          () => {}
        );
      });
    };
  }, []);

  React.useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (!pendingPayloadRef.current) return;
      e.preventDefault();
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, []);

  const onChangeText = (next: string) => {
    setText(next);
    scheduleSave({ text: next, startOverride, endOverride });
  };

  // Changing the start date/time shifts the end by the same amount, keeping duration
  // fixed — the end time can then be adjusted independently.
  const onChangeStartDate = (dateStr: string) => {
    const nextStart = dateTimeInputToMs(dateStr, msToTimeInput(effectiveStart, browserTimezone), browserTimezone);
    if (nextStart === null) return;
    const duration = effectiveEnd - effectiveStart;
    setStartOverride(nextStart);
    setEndOverride(nextStart + duration);
    scheduleSave({ text: text ?? '', startOverride: nextStart, endOverride: nextStart + duration });
  };

  const onChangeStartTime = (timeStr: string) => {
    const nextStart = dateTimeInputToMs(msToDateInput(effectiveStart, browserTimezone), timeStr, browserTimezone);
    if (nextStart === null) return;
    const duration = effectiveEnd - effectiveStart;
    setStartOverride(nextStart);
    setEndOverride(nextStart + duration);
    scheduleSave({ text: text ?? '', startOverride: nextStart, endOverride: nextStart + duration });
  };

  const onChangeEndTime = (timeStr: string) => {
    const nextEnd = dateTimeInputToMs(msToDateInput(effectiveEnd, browserTimezone), timeStr, browserTimezone);
    if (nextEnd === null || nextEnd <= effectiveStart) return;
    setEndOverride(nextEnd);
    scheduleSave({ text: text ?? '', startOverride, endOverride: nextEnd });
  };

  const clearReschedule = () => {
    setStartOverride(null);
    setEndOverride(null);
    scheduleSave({ text: text ?? '', startOverride: null, endOverride: null });
  };

  const onPublish = async () => {
    if (!text?.trim()) return;
    setPublishing(true);
    const { values, relations } = buildPublishOccurrenceOps({
      spaceId,
      seriesId: callId,
      seriesName,
      occurrenceStart: effectiveStart,
      occurrenceEnd: effectiveEnd,
      agendaBlocks: parseAgendaText(text),
      existingEventId: publishedEvent?.entityId ?? null,
      existingBlockRelations: publishedEvent?.blockRelations ?? [],
    });

    await makeProposal({
      values,
      relations,
      spaceId,
      name: publishedEvent ? `Update agenda for ${seriesName}` : `Publish agenda for ${seriesName}`,
      onSuccess: async () => {
        const token = await getToken();
        if (token) await deleteDraftBestEffort({ spaceId, callId, occurrenceStart: occurrence.startMs }, token);
        setToast(<>Agenda published.</>);
        setPublishing(false);
        queryClient.invalidateQueries({ queryKey: eventQueryKey });
      },
      onError: () => {
        setPublishing(false);
        setToast(<>Couldn’t publish the agenda right now.</>);
      },
    });
  };

  const onDeleteOccurrence = async () => {
    if (!publishedEvent) return;
    setDeleting(true);
    const values = buildDeleteOccurrenceOps({
      entityId: publishedEvent.entityId,
      spaceId,
      name: `${seriesName} — ${formatDateLabel(occurrence.startMs)}`,
    });

    await makeProposal({
      values,
      relations: [],
      spaceId,
      name: `Delete occurrence of ${seriesName}`,
      onSuccess: async () => {
        if (autoPublishAhead > 0) {
          const token = await getToken();
          if (token) await reconcileAutoPublish({ spaceId, callId }, token).catch(() => {});
        }
        setToast(<>Occurrence deleted.</>);
        setDeleting(false);
        setConfirmingDelete(false);
        queryClient.invalidateQueries({ queryKey: eventQueryKey });
      },
      onError: () => {
        setDeleting(false);
        setConfirmingDelete(false);
      },
    });
  };

  const readOnly = !isEditor || locked;

  return (
    <div className="mx-auto flex max-w-[820px] flex-col gap-4 px-4 py-8">
      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <span className="text-smallTitle">{seriesName} — Agenda</span>
          <span className="text-metadata text-grey-04">
            {formatDateLabel(effectiveStart)} · {formatTimeRange(effectiveStart, effectiveEnd)}
          </span>
          {rescheduled && (
            <span className="text-footnote text-grey-03">
              Originally {formatDateLabel(occurrence.startMs)} · {formatTimeRange(occurrence.startMs, occurrence.endMs)}
            </span>
          )}
        </div>
        <OccurrenceSelector
          schedule={schedule}
          selectedStartMs={occurrence.startMs}
          hrefFor={(startMs, endMs) => agendaHref(spaceId, callId, startMs, endMs)}
        />
      </div>

      <StatusPill status={status} locked={locked} />

      {publishedEvent && isEditor && (
        <div className="flex items-center gap-2">
          {confirmingDelete ? (
            <>
              <span className="text-metadata text-text">Delete this published occurrence?</span>
              <SmallButton onClick={() => setConfirmingDelete(false)} disabled={deleting}>
                Cancel
              </SmallButton>
              <SmallButton onClick={onDeleteOccurrence} disabled={deleting}>
                {deleting ? 'Deleting…' : 'Delete occurrence'}
              </SmallButton>
            </>
          ) : (
            <SmallButton onClick={() => setConfirmingDelete(true)}>Delete published occurrence</SmallButton>
          )}
        </div>
      )}

      {!readOnly && notYetStarted && (
        <div className="flex flex-col gap-3 rounded-lg border border-grey-02 p-4">
          <div className="flex items-center justify-between">
            <span className="text-metadataMedium">Reschedule this occurrence</span>
            {rescheduled && <SmallButton onClick={clearReschedule}>Reset to scheduled time</SmallButton>}
          </div>
          <div className="flex flex-wrap gap-3">
            <label className="flex flex-col gap-1 text-metadata text-grey-04">
              Start date
              <input
                type="date"
                value={msToDateInput(effectiveStart, browserTimezone)}
                onChange={e => onChangeStartDate(e.target.value)}
                className="rounded-md border border-grey-02 px-3 py-2 text-metadata"
              />
            </label>
            <label className="flex flex-col gap-1 text-metadata text-grey-04">
              Start time ({zoneLabel})
              <input
                type="time"
                value={msToTimeInput(effectiveStart, browserTimezone)}
                onChange={e => onChangeStartTime(e.target.value)}
                className="rounded-md border border-grey-02 px-3 py-2 text-metadata"
              />
            </label>
            <label className="flex flex-col gap-1 text-metadata text-grey-04">
              End time ({zoneLabel})
              <input
                type="time"
                value={msToTimeInput(effectiveEnd, browserTimezone)}
                onChange={e => onChangeEndTime(e.target.value)}
                className="rounded-md border border-grey-02 px-3 py-2 text-metadata"
              />
            </label>
          </div>
          {rescheduleError && <span className="text-footnote text-red-01">{rescheduleError}</span>}
        </div>
      )}

      {readOnly ? (
        <ReadOnlyAgenda text={text} accessLoading={accessLoading} locked={locked} />
      ) : (
        <>
          <Textarea
            value={text ?? ''}
            onChange={e => onChangeText(e.target.value)}
            minRows={8}
            placeholder={'Write the agenda for this occurrence. Separate items with a blank line.'}
            className="w-full resize-none rounded-lg border border-grey-02 p-4 text-body outline-none placeholder:text-grey-03"
          />
          <div className="flex items-center justify-between">
            <span className="text-footnote text-grey-03">{savingDraft ? 'Saving draft…' : ' '}</span>
            <Button
              variant="primary"
              disabled={publishing || !text?.trim() || Boolean(rescheduleError)}
              onClick={onPublish}
            >
              {publishing ? 'Publishing…' : publishedEvent ? 'Republish agenda' : 'Publish agenda'}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

const STATUS_LABELS: Record<Status, string> = {
  predicted: 'No agenda yet',
  draft: 'Draft',
  unpublished: 'Unpublished changes',
  published: 'Published',
};

function StatusPill({ status, locked }: { status: Status; locked: boolean }) {
  const label = locked ? 'Locked' : STATUS_LABELS[status];

  return <span className="w-fit rounded bg-grey-01 px-2 py-1 text-metadata text-grey-04">{label}</span>;
}

function ReadOnlyAgenda({
  text,
  accessLoading,
  locked,
}: {
  text: string | null;
  accessLoading: boolean;
  locked: boolean;
}) {
  if (accessLoading || text === null) {
    return <p className="text-metadata text-grey-04">Loading agenda…</p>;
  }

  if (!text.trim()) {
    return (
      <p className="text-metadata text-grey-04">
        {locked ? 'No agenda was published for this occurrence.' : 'No agenda published yet.'}
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-grey-02 p-4">
      {text
        .split(/\n\s*\n/)
        .map(block => block.trim())
        .filter(Boolean)
        .map((block, i) => (
          <div key={i} className="text-body text-text">
            {renderMarkdownDocument(block)}
          </div>
        ))}
    </div>
  );
}
