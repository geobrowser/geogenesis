'use client';

import * as React from 'react';

import cx from 'classnames';

import { useToast } from '~/core/hooks/use-toast';

import { Button } from '~/design-system/button';
import { Spinner } from '~/design-system/spinner';
import { Text } from '~/design-system/text';

import type { DebateMediaTurnSegment, ParticipantSlot } from '../api';
import { GeoChatRequestError } from '../api';
import { DebateFeedPlayer } from '../browse/debate-feed-player';
import { useDebate, useDebateExtractedClaims, useDebateMedia, useDebateTranscript, useGeoChatAuth } from '../hooks';
import { NEGATIVE_TEXT_CLASS, POSITIVE_TEXT_CLASS, WAITING_TEXT_CLASS } from '../matchmaking/admin-debate-parts';
import { HUB_LIGHT_CALLOUT_CLASS_NAME } from '../matchmaking/hub-callout';
import type { MomentBackfillEntry } from './api';
import { type ClaimOption, ClipRow } from './clip-row';
import {
  isMediaAdminRefusal,
  useMomentBackfill,
  useMomentReelPlan,
  useQueueMomentReel,
  useRefreshAfterReel,
} from './hooks';
import {
  type EditorClip,
  MANUAL_MAX_CLIPS,
  type ServedMoment,
  clipProblems,
  clipQuote,
  clipSpeaker,
  clipsFromLiveReel,
  clipsFromServedMoments,
  formatReelTime,
  manualReelClips,
  newClipKey,
  playerWords,
  reelProblems,
  snapEdge,
} from './reel';
import { ReelPreviewPanel } from './reel-preview-panel';
import { type ReelJob, jobInFlight, reelJob, refusalBlocksEditing, refusalMessage } from './reel-status';

/** What a new clip at the playhead runs for, before it is trimmed. */
const NEW_CLIP_MS = 15_000;

const NO_TURNS: DebateMediaTurnSegment[] = [];
/** The words the editor snaps edges to and counts speakers with (GEO-3349). Stable, as a query key part. */
const TRANSCRIPT_INCLUDE = ['words'] as const;

/**
 * The moments editor (GEO-3671): a media admin fine-tunes a debate's moment reel, previews exactly
 * what the media worker would publish, then publishes it and watches it go live. Every time here is
 * on the debate player's clock; geo-chat converts the reel itself (`clock: "player"`).
 *
 * geo-chat is the gate: its admin read answers 403 to anyone off the media-admin list, and the page
 * shows nothing of the editor until that read has answered.
 */
export function MomentsEditor({ debateId }: { debateId: string }) {
  const { ready, authenticated } = useGeoChatAuth();
  const backfill = useMomentBackfill(debateId, true);

  if (!ready || (authenticated && backfill.isPending)) return <EditorShell title={null}>Loading…</EditorShell>;
  if (!authenticated) return <EditorShell title={null}>Sign in as a media admin to edit moments.</EditorShell>;
  // Only before the first answer. A poll that fails later keeps its last data, and swapping the
  // editor out for an error then would unmount it and lose every unsaved edit.
  if (backfill.data === undefined) {
    return (
      <EditorShell title={null}>
        {isMediaAdminRefusal(backfill.error)
          ? "Only media admins can edit a debate's moments."
          : "Couldn't reach the moments service. Reload to try again."}
      </EditorShell>
    );
  }
  return <Editor debateId={debateId} />;
}

function Editor({ debateId }: { debateId: string }) {
  const debate = useDebate(debateId, true);
  const media = useDebateMedia(debateId, true);
  const claims = useDebateExtractedClaims(debateId, true);
  const plan = useMomentReelPlan(debateId, true);
  const transcript = useDebateTranscript(debateId, 'json', true, TRANSCRIPT_INCLUDE);
  const backfill = useMomentBackfill(debateId, true);
  const queue = useQueueMomentReel(debateId);
  const refreshAfterReel = useRefreshAfterReel(debateId);
  const [, setToast] = useToast();

  const turns = media.data?.turn_segments ?? NO_TURNS;
  const words = React.useMemo(() => playerWords(transcript.data?.words), [transcript.data?.words]);
  const payload = claims.data?.payload;
  const entry = plan.data ?? null;

  // The reel the editor opens on: the live cuts where geo-chat serves them, the served moments
  // (word ranges, so approximate) where it does not yet. Loaded once each has answered: a refetch
  // that fails later keeps its data, and must not take the editor away.
  const loaded = plan.data !== undefined && media.data !== undefined && claims.data !== undefined;
  // The served moments matter only without live cuts; with them, a claims refetch that lands before
  // the plan's would rebuild the reel from the old cuts.
  const servedMomentsAt = entry?.live_reel ? 0 : claims.dataUpdatedAt;
  const source = React.useMemo(() => {
    if (!loaded) return null;
    if (entry?.live_reel) {
      return { clips: clipsFromLiveReel(entry.live_reel, turns), approximate: false };
    }
    const moments = ((payload as { moments?: ServedMoment[] } | undefined)?.moments ?? []) as ServedMoment[];
    return { clips: clipsFromServedMoments(moments, payload?.claims ?? [], turns), approximate: true };
    // Rebuilt only when the reel itself may have changed: its version, whether cuts are served, or
    // the served moments read again.
  }, [loaded, entry?.reel_version, Boolean(entry?.live_reel), servedMomentsAt]); // eslint-disable-line react-hooks/exhaustive-deps

  const [saved, setSaved] = React.useState<EditorClip[] | null>(null);
  const [clips, setClips] = React.useState<EditorClip[]>([]);
  const dirty = saved !== null && reelKey(clips) !== reelKey(saved);
  const dirtyRef = React.useRef(dirty);
  dirtyRef.current = dirty;
  React.useEffect(() => {
    if (!source) return;
    // A reel that changed under an unsaved edit leaves the edit alone; publishing it is then refused
    // (`reel_changed`) and says so.
    if (saved !== null && dirtyRef.current) return;
    setSaved(source.clips);
    setClips(source.clips);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source]);

  const [playheadMs, setPlayheadMs] = React.useState<number | null>(null);
  const onPlayheadChange = React.useCallback((seconds: number) => setPlayheadMs(Math.round(seconds * 1000)), []);
  const [seek, setSeek] = React.useState<{ ms: number; nonce: number } | null>(null);
  const seekTo = (ms: number) => setSeek(previous => ({ ms, nonce: (previous?.nonce ?? 0) + 1 }));

  const [confirm, setConfirm] = React.useState<'publish' | 'unlock' | null>(null);
  const [queueError, setQueueError] = React.useState<string | null>(null);
  // The request this visit queued: a finished one is reported only if it is ours. `sent` is the reel
  // as sent, in that order: the worker's `clip N` and a preview's moments count in it, not in the
  // reel as edited since (a clip removed or moved shifts every index after it).
  const [tracked, setTracked] = React.useState<{
    requestedAt: string;
    reelKey: string;
    sent: EditorClip[];
  } | null>(null);

  const request = backfill.data?.request ?? null;
  const job = reelJob(request);
  const inFlight = jobInFlight(job);
  const ours = tracked !== null && request?.requested_at === tracked.requestedAt;

  // Whenever a request leaves the queue, the reel may have changed under the editor: read its
  // version and cuts again. One this visit published, or returned to automatic, is announced, and
  // the editor moves on to the reel that is live now.
  const wasInFlight = React.useRef(inFlight);
  const reported = React.useRef<string | null>(null);
  React.useEffect(() => {
    const finished = wasInFlight.current && !inFlight;
    wasInFlight.current = inFlight;
    if (ours && request && job.kind === 'done' && !job.preview && reported.current !== request.requested_at) {
      reported.current = request.requested_at;
      setToast(<span>{job.unlock ? 'Back to the automatic reel' : 'Hand-picked reel is live'}</span>);
      // What was sent is live now, so it is no longer an unsaved edit, and the reel read next is
      // taken. An edit made since sending stays unsaved. (Not via `dirtyRef`: the next render
      // writes it back from `dirty`.)
      setSaved(tracked?.sent ?? null);
      refreshAfterReel();
    } else if (finished) {
      refreshAfterReel();
    }
  }, [inFlight, ours, request, job, tracked, setToast, refreshAfterReel]);

  const participants = debate.data?.participants ?? [];
  const nameOf = (slot: ParticipantSlot | null) =>
    slot === null ? null : (participants.find(p => p.participant_slot === slot)?.display_name ?? `Debater ${slot}`);

  const claimOptions = React.useMemo(() => claimsBySpeaker(payload), [payload]);
  const claimSlot = (index: number) => claimOptions.slot.get(index) ?? null;

  const readOnlyReason = editingBlockedReason(entry, transcript.data?.word_timing, plan.error);
  const readOnly = readOnlyReason !== null;

  const clipViews = clips.map(clip => {
    const speaker = clipSpeaker(words, clip.start_ms, clip.end_ms);
    const sentAt = tracked?.sent.findIndex(sent => sent.key === clip.key) ?? -1;
    const reported = ours && job.kind === 'failed' && sentAt >= 0 ? (job.clips[sentAt] ?? []) : [];
    return {
      clip,
      speaker,
      quote: clipQuote(words, clip.start_ms, clip.end_ms),
      problems: [...clipProblems(clip, words, turns), ...reported],
    };
  });
  // The worker numbers a failed reel's clips as sent; the editor's notices count them as they are now.
  const flaggedClips =
    ours && job.kind === 'failed' && tracked
      ? Object.keys(job.clips)
          .map(sentAt => clips.findIndex(clip => clip.key === tracked.sent[Number(sentAt)]?.key))
          .filter(at => at >= 0)
          .sort((a, b) => a - b)
          .map(at => at + 1)
      : [];
  const wholeReelProblems = reelProblems(clips, words);
  const hasProblems = wholeReelProblems.length > 0 || clipViews.some(view => view.problems.length > 0);
  const canQueue = !readOnly && !inFlight && !queue.isPending && !hasProblems && clips.length > 0;

  const updateClip = (index: number, update: (clip: EditorClip) => EditorClip) =>
    setClips(current =>
      current.map((clip, at) => {
        if (at !== index) return clip;
        const next = update(clip);
        // A claim picked for one speaker never rides along when the clip changes speaker.
        if (
          next.claim_index !== null &&
          claimSlot(next.claim_index) !== clipSpeaker(words, next.start_ms, next.end_ms)
        ) {
          return { ...next, claim_index: null };
        }
        return next;
      })
    );

  const submit = (kind: 'preview' | 'publish' | 'unlock') => {
    setConfirm(null);
    setQueueError(null);
    const base = entry?.reel_version ?? undefined;
    const body =
      kind === 'unlock'
        ? // `story`: the re-pick is a story reel like every other reel (runbook, "Back to automatic").
          { unlock: true, story: true, reason: 'Moments editor: return to automatic', ...(base && { base }) }
        : {
            preview: kind === 'preview',
            reason: kind === 'preview' ? 'Moments editor: preview' : 'Moments editor: hand-picked reel',
            reel: { clock: 'player' as const, clips: manualReelClips(clips), ...(base && { base }) },
          };
    queue.mutate(body, {
      onSuccess: queued => {
        if (!queued?.queued || !queued.request) {
          setQueueError(refusalMessage(queued?.refusal ?? 'not_queued'));
          return;
        }
        setTracked({ requestedAt: queued.request.requested_at, reelKey: reelKey(clips), sent: clips });
      },
      onError: error => setQueueError(queueErrorMessage(error)),
    });
  };

  const title = debate.data?.claim.claim ?? null;
  if (!loaded || transcript.isPending) {
    const failed = plan.error ?? media.error ?? claims.error;
    return (
      <EditorShell title={title}>
        {failed && !isMediaAdminRefusal(failed) ? "Couldn't load this debate's reel. Reload to try again." : 'Loading…'}
      </EditorShell>
    );
  }

  // geo-chat names who published a hand-picked reel only when it knows (GEO-3666): a reel locked
  // before it kept that is `hand_picked: null`, though still locked. The payload's flag is the lock.
  const handPicked = entry?.hand_picked ?? null;
  const locked =
    handPicked !== null || (payload as { moment_reel_manual?: unknown } | undefined)?.moment_reel_manual === true;
  const showJob = inFlight || (ours && job.kind !== 'none');

  return (
    <EditorShell
      title={title}
      actions={
        <>
          <StatusPill job={job} dirty={dirty} handPicked={locked} />
          <Button variant="secondary" disabled={!canQueue} onClick={() => submit('preview')}>
            Preview
          </Button>
          <Button variant="secondary" disabled={!dirty || inFlight} onClick={() => saved && setClips(saved)}>
            Discard changes
          </Button>
          {locked && !dirty && !inFlight && !readOnly ? (
            <Button variant="secondary" disabled={queue.isPending} onClick={() => setConfirm('unlock')}>
              Return to automatic
            </Button>
          ) : null}
          <Button disabled={!canQueue || !dirty} onClick={() => setConfirm('publish')}>
            Publish reel
          </Button>
        </>
      }
    >
      {handPicked ? (
        <Text as="p" variant="metadata" color="grey-04">
          Hand-picked on {new Date(handPicked.requested_at).toLocaleString()}. Automatic picks and re-cuts leave it
          alone until it&apos;s returned to automatic.
        </Text>
      ) : null}
      {readOnlyReason ? <Notice tone="bad">{readOnlyReason}</Notice> : null}
      {source?.approximate ? (
        <Notice tone="wait">
          These are the moments as served: each clip&apos;s words, not where it was cut, so start and end times are
          approximate. Check them before publishing.
        </Notice>
      ) : null}
      {confirm === 'publish' ? (
        <ConfirmCard
          title="Publish this reel?"
          confirmLabel="Publish and lock"
          onCancel={() => setConfirm(null)}
          onConfirm={() => submit('publish')}
        >
          It&apos;s queued for the media worker, which renders the clips from the recordings. The live moments
          don&apos;t change until that&apos;s done; then this reel replaces them for everyone and is locked, so
          automatic picks and re-cuts leave it alone.
        </ConfirmCard>
      ) : null}
      {confirm === 'unlock' ? (
        <ConfirmCard
          title="Return to automatic?"
          confirmLabel="Unlock and re-pick"
          onCancel={() => setConfirm(null)}
          onConfirm={() => submit('unlock')}
        >
          This unlocks the reel and queues a fresh automatic pick. The hand-picked reel stays live until the new clips
          are rendered.
        </ConfirmCard>
      ) : null}
      {queueError ? <Notice tone="bad">{queueError}</Notice> : null}
      {showJob && !job.preview ? <JobNotice job={job} flagged={flaggedClips} /> : null}
      {wholeReelProblems.length > 0 ? (
        <Notice tone="bad">
          {wholeReelProblems.map(problem => (
            <span key={problem} className="block">
              {problem}
            </span>
          ))}
        </Notice>
      ) : null}

      <div className="grid grid-cols-[minmax(0,1fr)_360px] items-start gap-6">
        <div className="flex min-w-0 flex-col gap-4">
          {debate.data ? (
            <div className="overflow-hidden rounded-xl border border-grey-02 bg-black">
              <DebateFeedPlayer
                debate={debate.data}
                active
                framed
                // A seek the editor asks for, applied once per request (the player latches on the
                // value, so a repeat to the same time is told apart by a negligible offset).
                initialSeekSeconds={seek ? seek.ms / 1000 + seek.nonce * 1e-6 : null}
                onPlayheadChange={onPlayheadChange}
              />
            </div>
          ) : null}
          <Text as="p" variant="metadata" color="grey-04" className="tabular-nums">
            Playhead {playheadMs === null ? '—' : formatReelTime(playheadMs)}. Times are as the debate player shows
            them.
          </Text>

          <section className="rounded border border-grey-02 bg-white">
            <div className="flex items-center justify-between gap-2 border-b border-divider p-3">
              <Text as="h2" variant="smallTitle">
                Reel, in play order
              </Text>
              <Button
                small
                variant="secondary"
                disabled={readOnly || clips.length >= MANUAL_MAX_CLIPS || playheadMs === null}
                onClick={() => {
                  if (playheadMs === null) return;
                  const start = snapEdge(playheadMs, words, 'start');
                  setClips(current => [
                    ...current,
                    {
                      key: newClipKey(),
                      start_ms: start,
                      end_ms: snapEdge(start + NEW_CLIP_MS, words, 'end'),
                      claim_index: null,
                      live_claim_text: null,
                    },
                  ]);
                }}
              >
                + Add clip at playhead
              </Button>
            </div>
            {clipViews.length === 0 ? (
              <Text as="p" variant="metadata" color="grey-04" className="p-3">
                No clips. Add one at the playhead.
              </Text>
            ) : (
              <ol>
                {clipViews.map((view, index) => (
                  <ClipRow
                    key={view.clip.key}
                    index={index}
                    clip={view.clip}
                    speakerSlot={view.speaker}
                    speakerName={nameOf(view.speaker)}
                    quote={view.quote}
                    words={words}
                    claims={view.speaker === null ? [] : (claimOptions.bySlot.get(view.speaker) ?? [])}
                    problems={view.problems}
                    readOnly={readOnly}
                    playheadMs={playheadMs}
                    onPlay={() => seekTo(view.clip.start_ms)}
                    onRemove={() => setClips(current => current.filter((_, at) => at !== index))}
                    onChangeClaim={claimIndex => updateClip(index, clip => ({ ...clip, claim_index: claimIndex }))}
                    onChangeEdge={(edge, ms, options) =>
                      updateClip(index, clip => {
                        const at = options?.snap ? snapEdge(ms, words, edge) : ms;
                        return edge === 'start' ? { ...clip, start_ms: at } : { ...clip, end_ms: at };
                      })
                    }
                  />
                ))}
              </ol>
            )}
          </section>
        </div>

        <ReelPreviewPanel
          job={ours && job.preview ? job : null}
          stale={tracked !== null && tracked.reelKey !== reelKey(clips)}
          turns={turns}
          clips={tracked?.sent ?? []}
          flagged={flaggedClips}
          nameOf={nameOf}
        />
      </div>
    </EditorShell>
  );
}

/** Whether two reels are the same edit: the same cuts and claims, in the same order. */
function reelKey(clips: readonly EditorClip[]) {
  return clips.map(clip => `${clip.start_ms}-${clip.end_ms}-${clip.claim_index ?? ''}`).join('|');
}

/**
 * Why the editor is read-only, or `null`. The dry run's refusal says it for most cases; a transcript
 * without word timings is re-transcribed by every request and is then often skipped
 * (`transcript_differs`), so it is read-only until that is fixed (GEO-3642).
 */
export function editingBlockedReason(
  entry: Pick<MomentBackfillEntry, 'refusal'> | null,
  wordTiming: boolean | undefined,
  planError: unknown
): string | null {
  if (planError) return "Couldn't check whether this debate can be edited. Reload to try again.";
  if (entry && refusalBlocksEditing(entry.refusal))
    return `Can't edit this reel: ${refusalMessage(entry.refusal ?? '')}`;
  if (wordTiming === false) {
    return "Can't edit this reel yet: its transcript has no word timings, so geo-chat would transcribe it again and may not match it (GEO-3642).";
  }
  return null;
}

function queueErrorMessage(error: unknown) {
  if (error instanceof GeoChatRequestError) {
    if (isMediaAdminRefusal(error)) return 'Only media admins can do this.';
    return error.message || refusalMessage(error.code ?? 'error');
  }
  return error instanceof Error ? error.message : 'Something went wrong. Try again.';
}

/**
 * The debate's claims each debater can link a clip to, and each claim's speaker: those geo-chat's
 * `moment_claims` links to. A `retained` claim (an earlier extraction's, kept for the graph) is not
 * one, and a clip naming it is refused ("there is no claim N").
 */
export function claimsBySpeaker(
  payload:
    | {
        turns?: { turn_index: number; participant_slot: number }[];
        claims?: { text: string; turn_index: number; retained?: boolean }[];
      }
    | undefined
) {
  const slotOfTurn = new Map((payload?.turns ?? []).map(turn => [turn.turn_index, turn.participant_slot]));
  const bySlot = new Map<ParticipantSlot, ClaimOption[]>();
  const slot = new Map<number, ParticipantSlot>();
  (payload?.claims ?? []).forEach((claim, index) => {
    if (claim.retained === true) return;
    const speaker = slotOfTurn.get(claim.turn_index);
    if (speaker !== 1 && speaker !== 2) return;
    slot.set(index, speaker);
    bySlot.set(speaker, [...(bySlot.get(speaker) ?? []), { index, text: claim.text }]);
  });
  return { bySlot, slot };
}

function EditorShell({
  title,
  actions,
  children,
}: {
  title: string | null;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="mx-auto flex w-full max-w-[1180px] flex-col gap-4 px-4 pt-8 pb-[120px]">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          {title ? (
            <Text as="div" variant="breadcrumb" color="grey-04">
              {title}
            </Text>
          ) : null}
          <Text as="h1" variant="largeTitle">
            Edit moments
          </Text>
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
      {typeof children === 'string' ? <Text variant="body">{children}</Text> : children}
    </div>
  );
}

const PILL_CLASS =
  'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[14px] leading-4 font-medium whitespace-nowrap';

/** Where the reel stands, never "published" while it is only queued. */
function StatusPill({ job, dirty, handPicked }: { job: ReelJob; dirty: boolean; handPicked: boolean }) {
  if (job.kind === 'queued') {
    return (
      <span className={cx(PILL_CLASS, 'bg-orange/15', WAITING_TEXT_CLASS)}>
        {job.preview ? 'Preview queued' : 'Queued · live reel unchanged'}
      </span>
    );
  }
  if (job.kind === 'rendering') {
    return (
      <span className={cx(PILL_CLASS, 'bg-ctaTertiary text-ctaPrimary')}>
        <Spinner />
        {job.preview ? 'Previewing' : 'Rendering clips'}
      </span>
    );
  }
  if (dirty) return <span className={cx(PILL_CLASS, 'bg-orange/15', WAITING_TEXT_CLASS)}>Unsaved changes</span>;
  if (handPicked) return <span className={cx(PILL_CLASS, 'bg-text text-white')}>Hand-picked · locked</span>;
  return <span className={cx(PILL_CLASS, 'bg-grey-01 text-grey-04')}>Auto-picked</span>;
}

/** What became of a publish or a return to automatic. `flagged`: the clips it failed on, as numbered now. */
function JobNotice({ job, flagged }: { job: ReelJob; flagged: readonly number[] }) {
  if (job.kind === 'queued') {
    return (
      <Notice tone="wait">
        <b className="font-medium">Queued.</b> The live reel stays as it is until the media worker renders the new
        clips. The queue can take a while; this page updates when it&apos;s done, and you can leave it.
      </Notice>
    );
  }
  if (job.kind === 'rendering') {
    return (
      <Notice tone="info">
        <span className="inline-flex items-center gap-2">
          <Spinner />
          <span>
            <b className="font-medium">Rendering clips</b> from the recordings. If a clip can&apos;t be cut, nothing
            changes and the clip is flagged here.
          </span>
        </span>
      </Notice>
    );
  }
  if (job.kind === 'done') {
    return (
      <Notice tone="ok">
        {job.unlock ? 'Back to the automatic reel: it is live.' : 'The hand-picked reel is live.'}
      </Notice>
    );
  }
  if (job.kind === 'failed') {
    return (
      <Notice tone="bad">
        <b className="font-medium">Nothing changed.</b> {job.summary}
        {flagged.length > 0 ? ` See clip${flagged.length > 1 ? 's' : ''} ${flagged.join(', ')}.` : ''}
        {job.other.map(problem => (
          <span key={problem} className="mt-1 block">
            {problem}
          </span>
        ))}
      </Notice>
    );
  }
  return null;
}

function Notice({ tone, children }: { tone: 'ok' | 'wait' | 'bad' | 'info'; children: React.ReactNode }) {
  return (
    <div
      role="status"
      className={cx(
        'rounded-lg px-4 py-3 text-[16px] leading-5',
        tone === 'ok' && cx('bg-successTertiary', POSITIVE_TEXT_CLASS),
        tone === 'wait' && cx('bg-orange/15', WAITING_TEXT_CLASS),
        tone === 'bad' && cx('bg-red-02', NEGATIVE_TEXT_CLASS),
        tone === 'info' && 'bg-ctaTertiary text-text'
      )}
    >
      {children}
    </div>
  );
}

function ConfirmCard({
  title,
  confirmLabel,
  onConfirm,
  onCancel,
  children,
}: {
  title: string;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      role="alertdialog"
      aria-label={title}
      className={cx(HUB_LIGHT_CALLOUT_CLASS_NAME, 'flex flex-wrap items-start justify-between gap-4 shadow-card')}
    >
      <p className="max-w-[62ch] text-[16px] leading-5">
        <b className="font-medium">{title}</b> {children}
      </p>
      <div className="flex gap-2">
        <Button variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
        <Button onClick={onConfirm}>{confirmLabel}</Button>
      </div>
    </div>
  );
}
