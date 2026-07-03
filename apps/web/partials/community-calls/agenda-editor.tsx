'use client';

import { useQuery } from '@tanstack/react-query';

import * as React from 'react';

import Textarea from 'react-textarea-autosize';

import { parseAgendaText, serializeAgendaBlocks } from '~/core/community-calls/agenda';
import { deleteOccurrenceDraft, getOccurrenceDraft, upsertOccurrenceDraft } from '~/core/community-calls/api';
import { buildPublishOccurrenceOps } from '~/core/community-calls/call-ops';
import { LIVE_MEETING_GRACE_MINUTES } from '~/core/community-calls/constants';
import { fetchOccurrenceEvent } from '~/core/community-calls/fetch-occurrence-event';
import { formatDateLabel, formatTimeRange } from '~/core/community-calls/format';
import { Occurrence } from '~/core/community-calls/types';
import { useCommunityCallIdentityToken } from '~/core/community-calls/use-identity-token';
import { useAccessControl } from '~/core/hooks/use-access-control';
import { usePublish } from '~/core/hooks/use-publish';
import { useToast } from '~/core/hooks/use-toast';

import { Button } from '~/design-system/button';

type Status = 'predicted' | 'draft' | 'published' | 'unpublished';

const SAVE_DEBOUNCE_MS = 1000;
const DELETE_DRAFT_RETRIES = 2;

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
}: {
  spaceId: string;
  callId: string;
  seriesName: string;
  occurrence: Occurrence;
}) {
  const { isEditor, isLoading: accessLoading } = useAccessControl(spaceId);
  const { identityToken, getToken } = useCommunityCallIdentityToken();
  const { makeProposal } = usePublish();
  const [, setToast] = useToast();

  const locked = Date.now() > occurrence.endMs + LIVE_MEETING_GRACE_MINUTES * 60 * 1000;

  const { data: publishedEvent, isFetched: publishedFetched } = useQuery({
    queryKey: ['community-call-occurrence-event', spaceId, callId, occurrence.startMs],
    queryFn: () => fetchOccurrenceEvent(callId, spaceId, occurrence.startMs),
  });

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
  const [publishing, setPublishing] = React.useState(false);
  const [savingDraft, setSavingDraft] = React.useState(false);
  const initializedRef = React.useRef(false);

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

  const onChangeText = (next: string) => {
    setText(next);
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      const token = await getToken();
      if (!token) return;
      setSavingDraft(true);
      await upsertOccurrenceDraft(
        {
          spaceId,
          callId,
          occurrenceStart: occurrence.startMs,
          agendaBlocks: parseAgendaText(next),
          startOverride: null,
          endOverride: null,
        },
        token
      ).catch(() => {});
      setSavingDraft(false);
    }, SAVE_DEBOUNCE_MS);
  };

  const onPublish = async () => {
    if (!text?.trim()) return;
    setPublishing(true);
    const { values, relations } = buildPublishOccurrenceOps({
      spaceId,
      seriesId: callId,
      seriesName,
      occurrenceStart: occurrence.startMs,
      occurrenceEnd: occurrence.endMs,
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
      },
      onError: () => {
        setPublishing(false);
        setToast(<>Couldn’t publish the agenda right now.</>);
      },
    });
  };

  const readOnly = !isEditor || locked;

  return (
    <div className="mx-auto flex max-w-[820px] flex-col gap-4 px-4 py-8">
      <div className="flex flex-col gap-1">
        <span className="text-smallTitle">{seriesName} — Agenda</span>
        <span className="text-metadata text-grey-04">
          {formatDateLabel(occurrence.startMs)} · {formatTimeRange(occurrence.startMs, occurrence.endMs)}
        </span>
      </div>

      <StatusPill status={status} locked={locked} />

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
            <Button variant="primary" disabled={publishing || !text?.trim()} onClick={onPublish}>
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
          <p key={i} className="text-body whitespace-pre-wrap text-text">
            {block}
          </p>
        ))}
    </div>
  );
}
