'use client';

import * as React from 'react';

import cx from 'classnames';

import { useToast } from '~/core/hooks/use-toast';

import { Button } from '~/design-system/button';
import { Spinner } from '~/design-system/spinner';
import { Text } from '~/design-system/text';
import { Tooltip } from '~/design-system/tooltip';

import type { DebateMediaTurnSegment, ParticipantSlot } from '../api';
import { GeoChatRequestError } from '../api';
import { DebateFeedPlayer } from '../browse/debate-feed-player';
import { useDebate, useDebateExtractedClaims, useDebateMedia, useDebateTranscript, useGeoChatAuth } from '../hooks';
import { NEGATIVE_TEXT_CLASS, POSITIVE_TEXT_CLASS, WAITING_TEXT_CLASS } from '../matchmaking/admin-debate-parts';
import { HUB_LIGHT_CALLOUT_CLASS_NAME } from '../matchmaking/hub-callout';
import { type MomentBackfillEntry, reelCarried, reelUnlinkable } from './api';
import { type ClaimOption, ClipRow } from './clip-row';
import {
  type EditorFacts,
  INITIAL_EDITOR_STATE,
  editorReducer,
  editorView,
  escapeTarget,
  selectedKey,
} from './editor-state';
import {
  isMediaAdminRefusal,
  useAudioPeaks,
  useMomentBackfill,
  useMomentReelPlan,
  useQueueMomentReel,
  useRefreshAfterReel,
} from './hooks';
import {
  type EditorClip,
  MANUAL_MAX_CLIPS,
  type ReelWord,
  type ServedMoment,
  clipProblems,
  clipQuote,
  clipSpeaker,
  clipsFromLiveReel,
  clipsFromServedMoments,
  edgeIsFree,
  formatReelTime,
  manualReel,
  newClipKey,
  playedCuts,
  playerWords,
  reelProblems,
  snapEdge,
} from './reel';
import { ReelPreviewPanel } from './reel-preview-panel';
import { type ReelJob, jobInFlight, reelJob, refusalBlocksEditing, refusalMessage } from './reel-status';
import { ReelTimeline } from './reel-timeline';
import { ReelTranscript, reelSentences } from './reel-transcript';
import { REEL_CLIPS, type ReelWarningFix, reelWarnings } from './reel-warnings';
import { ReelWarningsPanel } from './reel-warnings-panel';
import { ReelWaveform } from './reel-waveform';
import { useEditorKeyboard } from './use-editor-keyboard';

/** What a new clip at the playhead runs for, before it is trimmed. */
const NEW_CLIP_MS = 15_000;

/** On the affordance that adds a 5th or 6th clip (GEO-3773, D4): reels aim for 4. */
export const EXTRA_CLIP_TOOLTIP = 'Reels work best with 4 clips. Add more only when the debate needs it.';

const NO_TURNS: DebateMediaTurnSegment[] = [];
/**
 * The words the editor snaps edges to and counts speakers with, and the sentences its transcript
 * lists (GEO-3349). Stable, as a query key part.
 */
const TRANSCRIPT_INCLUDE = ['words', 'sentences'] as const;

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
  // The waveform never holds the editor up: until it is ready, or without one, editing works the same.
  const peaks = useAudioPeaks(debateId, true);
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
  // Every clip is mapped onto the player's clock through the turns, which a re-render moves: the
  // media read again after one may land after the plan's, and must still remap the reel.
  const turnsKey = React.useMemo(() => turnClockKey(turns), [turns]);
  // Locked with no reel (geo-chat#352): viewers see none, so the editor opens on none. The clip files
  // geo-chat kept are the lost reel's, and the served moments can still name one of them.
  const unlinkable = reelUnlinkable(entry);
  const source = React.useMemo(() => {
    if (!loaded) return null;
    const version = entry?.reel_version ?? null;
    if (unlinkable) return { clips: [], approximate: false, version };
    if (entry?.live_reel) {
      return { clips: clipsFromLiveReel(entry.live_reel, turns), approximate: false, version };
    }
    const moments = ((payload as { moments?: ServedMoment[] } | undefined)?.moments ?? []) as ServedMoment[];
    return { clips: clipsFromServedMoments(moments, payload?.claims ?? [], turns), approximate: true, version };
    // Rebuilt only when the reel itself may have changed: its version, whether cuts are served, or
    // the served moments read again; or when the clock it is mapped through moved.
  }, [loaded, entry?.reel_version, Boolean(entry?.live_reel), unlinkable, servedMomentsAt, turnsKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const [saved, setSaved] = React.useState<EditorClip[] | null>(null);
  const [clips, setClips] = React.useState<EditorClip[]>([]);
  const dirty = saved !== null && reelKey(clips) !== reelKey(saved);
  const dirtyRef = React.useRef(dirty);
  dirtyRef.current = dirty;
  // The version of the reel the edit was made on, sent as `base`: not the latest the plan says, which
  // moves on when a reel changes under an unsaved edit, and would let the edit overwrite that reel.
  const [base, setBase] = React.useState<string | null>(null);
  // Set when this visit's publish goes live: an edit made since sits on the reel that is live now,
  // so the version read next is the one it is made on.
  const adoptNextVersion = React.useRef(false);
  React.useEffect(() => {
    if (!source) return;
    // A reel that changed under an unsaved edit leaves the edit alone; publishing it is then refused
    // (`reel_changed`) and says so.
    if (saved !== null && dirtyRef.current) {
      if (adoptNextVersion.current && source.version !== base) {
        adoptNextVersion.current = false;
        setBase(source.version);
      }
      return;
    }
    adoptNextVersion.current = false;
    setBase(source.version);
    setSaved(source.clips);
    setClips(source.clips);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source]);

  const [playheadMs, setPlayheadMs] = React.useState<number | null>(null);
  const onPlayheadChange = React.useCallback((seconds: number) => setPlayheadMs(Math.round(seconds * 1000)), []);
  const [seek, setSeek] = React.useState<{ ms: number; nonce: number } | null>(null);
  const seekTo = (ms: number) => setSeek(previous => ({ ms, nonce: (previous?.nonce ?? 0) + 1 }));

  // How the admin is looking at the reel: the selected clip or none, the side panel, the open
  // popover or confirm, and what plays (GEO-3773). The reel itself stays in `clips`. `view` is what
  // the admin asked for; what is shown is `shown`, below, judged against the data by one rule.
  const [view, dispatch] = React.useReducer(editorReducer, INITIAL_EDITOR_STATE);
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
    // A check this visit asked for opens its report in the side panel once, when it lands.
    if (
      ours &&
      request &&
      job.preview &&
      (job.kind === 'done' || job.kind === 'failed') &&
      reported.current !== request.requested_at
    ) {
      reported.current = request.requested_at;
      dispatch({ type: 'openPanel', panel: 'check' });
      // Like any request leaving the queue, the reel may have moved on under it meanwhile.
      if (finished) refreshAfterReel();
    } else if (ours && request && job.kind === 'done' && !job.preview && reported.current !== request.requested_at) {
      reported.current = request.requested_at;
      setToast(<span>{job.unlock ? 'Back to the automatic reel' : 'Hand-picked reel is live'}</span>);
      // What was sent is live now, so it is no longer an unsaved edit, and the reel read next is
      // taken. An edit made since sending stays unsaved. (Not via `dirtyRef`: the next render
      // writes it back from `dirty`.)
      setSaved(tracked?.sent ?? null);
      adoptNextVersion.current = true;
      refreshAfterReel();
    } else if (finished) {
      refreshAfterReel();
    }
  }, [inFlight, ours, request, job, tracked, setToast, refreshAfterReel]);

  // The check's report is about this visit's check: once the debate's request is someone else's (another
  // admin's publish, a fresh automatic pick) or this visit's next one, the panel goes back to the transcript.
  const showsCheck = ours && job.preview;

  const participants = debate.data?.participants ?? [];
  const nameOf = (slot: ParticipantSlot | null) =>
    slot === null ? null : (participants.find(p => p.participant_slot === slot)?.display_name ?? `Debater ${slot}`);

  const claimOptions = React.useMemo(() => claimsBySpeaker(payload), [payload]);
  const claimSlot = (index: number) => claimOptions.slot.get(index) ?? null;

  // Only before the first answer, like the other reads: a later refetch that fails keeps its words.
  const transcriptFailed = !transcript.isPending && transcript.data === undefined;
  const readOnlyReason = editingBlockedReason(
    entry,
    transcript.data?.word_timing,
    plan.error,
    transcriptFailed,
    inFlight,
    dirty
  );
  const readOnly = readOnlyReason !== null;
  // A carried reel can't be edited, but it can be returned to automatic, which geo-chat doesn't refuse
  // (its dry run here is that unlock): that is how its clips get picked again.
  const carried = reelCarried(entry);
  const canUnlockCarried = carried && !plan.error && !refusalBlocksEditing(entry?.refusal);

  // What the worker reported on a failed reel, clip by clip as sent. A problem stays on a clip only
  // while the clip is still as it was sent: one changed since (an edge, its claim) or replaced is
  // judged afresh, so fixing it lets the reel be published again (GEO-3705). Clips left alone keep
  // theirs until the next publish.
  const failedSent = ours && job.kind === 'failed' && tracked ? { job, sent: tracked.sent } : null;
  const reportedOn = (clip: EditorClip): string[] => {
    if (!failedSent) return [];
    const sentAt = failedSent.sent.findIndex(sent => sent.key === clip.key);
    if (sentAt < 0 || clipKey(failedSent.sent[sentAt]) !== clipKey(clip)) return [];
    return failedSent.job.clips[sentAt] ?? [];
  };
  const clipViews = clips.map(clip => {
    const speaker = clipSpeaker(words, clip.start_ms, clip.end_ms);
    const reported = reportedOn(clip);
    return {
      clip,
      speaker,
      quote: clipQuote(words, clip.start_ms, clip.end_ms),
      // A carried reel's cuts are on the old video's clock, mapped here through the new one's turns:
      // checked against the new words they would flag spans its clips don't play (it is read-only,
      // so nothing is gated on them).
      problems: carried ? reported : [...clipProblems(clip, words, turns), ...reported],
    };
  });
  // The worker numbers a failed reel's clips as sent; the editor's notices count them as they are now,
  // and name only the clips still flagged.
  const flaggedClips = clips.flatMap((clip, at) => (reportedOn(clip).length > 0 ? [at + 1] : []));
  const wholeReelProblems = carried ? [] : reelProblems(clips, words);
  const hasProblems = wholeReelProblems.length > 0 || clipViews.some(view => view.problems.length > 0);
  const canQueue = !readOnly && !inFlight && !queue.isPending && !hasProblems && clips.length > 0;

  // geo-chat names who published a hand-picked reel only when it knows (GEO-3666): a reel locked
  // before it kept that is `hand_picked: null`, though still locked. The payload's flag is the lock.
  const handPicked = entry?.hand_picked ?? null;
  const locked =
    handPicked !== null ||
    unlinkable ||
    (payload as { moment_reel_manual?: unknown } | undefined)?.moment_reel_manual === true;
  const canPublish = canQueue && dirty;
  const canUnlock = locked && !dirty && !inFlight && (!readOnly || canUnlockCarried);

  // What is shown: the panel and popover the admin asked for, while the data still allows them
  // (`effectivePanel` / `effectivePopover`, the one rule). A confirm stays open only while what it
  // confirms can still be sent: an edit made under it can break a clip, or turn a return to automatic
  // into one that would throw the edit away. Rendering, Esc and the keyboard read only this.
  const clipKeyList = clips.map(clip => clip.key).join('|');
  const facts: EditorFacts = { checkShown: showsCheck, readOnly, canPublish, canUnlock };
  const shown = editorView(view, { keys: clipKeyList === '' ? [] : clipKeyList.split('|'), ...facts });
  const confirm = shown.popover === 'publish' || shown.popover === 'unlock' ? shown.popover : null;
  // What the facts closed stays closed (it doesn't come back when they allow it again).
  React.useEffect(() => {
    dispatch({ type: 'settle', facts: { checkShown: showsCheck, readOnly, canPublish, canUnlock } });
  }, [view, showsCheck, readOnly, canPublish, canUnlock]);

  // A claim picked for one speaker never rides along when the clip changes speaker, however the
  // clip changed: an edge, a drag, a fix, a sentence from the transcript. Each clip is judged against
  // itself before the change, so one the change left alone keeps its claim.
  const keepClaimsWithSpeakers = (previous: readonly EditorClip[], next: EditorClip[]) =>
    next.map(clip => {
      const before = previous.find(candidate => candidate.key === clip.key);
      return before ? keepClaimWithSpeaker(before, clip, words, claimSlot) : clip;
    });
  const updateClip = (index: number, update: (clip: EditorClip) => EditorClip) =>
    setClips(current =>
      keepClaimsWithSpeakers(
        current,
        current.map((clip, at) => (at === index ? update(clip) : clip))
      )
    );

  // The selected clip by its key, not its place: removing or moving another clip leaves it selected,
  // rather than handing the transcript's Start/End to whichever clip took its place. None selected
  // (`-1`) is the whole debate.
  const selected = selectedKey(shown);
  const selectedIndex = selected === null ? -1 : clips.findIndex(clip => clip.key === selected);
  // A flagged clip (one with a problem to fix) keeps the claim panel open: looked up by key, so a
  // clip that moved or a fix's new list is judged as the clip it is.
  const selectKey = (key: string) =>
    dispatch({
      type: 'select',
      key,
      flagged: (clipViews.find(view => view.clip.key === key)?.problems.length ?? 0) > 0,
    });
  const setSelected = (index: number, list: readonly EditorClip[] = clips) => {
    const key = list[index]?.key;
    if (key !== undefined) selectKey(key);
  };
  // The selection follows the reel as it changes: a removed clip hands it to the clip that took its
  // place, and a reel playing stops once its clips change.
  React.useEffect(() => {
    dispatch({ type: 'clipsChanged', keys: clipKeyList === '' ? [] : clipKeyList.split('|') });
  }, [clipKeyList]);
  const speakers = clipViews.map(view => view.speaker);
  const sentences = React.useMemo(() => reelSentences(transcript.data), [transcript.data]);
  const durationMs = Math.max(
    1,
    ...turns.map(turn => turn.source_end_ms ?? turn.output_end_ms),
    ...(words.length > 0 ? [words[words.length - 1].end_ms] : []),
    ...clips.map(clip => clip.end_ms)
  );
  // What each clip will play as geo-chat cuts it: shaded on the waveform, and where "play" starts.
  // Memoised: the Editor re-renders on every playhead tick and drag move, and each cut scans every word.
  const played = React.useMemo(
    () => (carried ? clips.map(() => null) : playedCuts(clips, words, turns)),
    [carried, clips, words, turns]
  );
  // None for a carried reel: like its clip checks, they would read its old-video cuts at the places
  // the new video's turns map them to, and it is read-only, so there is nothing to fix.
  const warnings = carried ? [] : reelWarnings(clips, words, nameOf);

  // The header's button and the warning's fix alike: without a playhead there is nowhere to add it.
  // A new clip starts at the playhead or at a transcript sentence. The transcript is the way in when
  // there is no playhead, as on the combined-video fallback, and no clip to select, as on a debate
  // locked without a reel.
  const canAddClip = !readOnly && clips.length < MANUAL_MAX_CLIPS;
  const canAddAtPlayhead = canAddClip && playheadMs !== null;
  const addClip = (span: { start_ms: number; end_ms: number }) => {
    if (!canAddClip) return;
    const key = newClipKey();
    setClips(current => [...current, { key, ...span, claim_index: null, live_claim_text: null }]);
    dispatch({ type: 'added', key });
  };
  const addClipAt = (ms: number) => {
    const start = snapEdge(ms, words, 'start');
    addClip({ start_ms: start, end_ms: snapEdge(start + NEW_CLIP_MS, words, 'end') });
  };
  // A transcript selection's words (GEO-3766): both edges are word edges now, so any free placement
  // the clip had is dropped and geo-chat widens them as it does any snapped edge.
  const setClipWords = (index: number, span: { start_ms: number; end_ms: number }) =>
    updateClip(index, ({ free_start_ms: _start, free_end_ms: _end, ...clip }) => ({ ...clip, ...span }));
  const addClipAtPlayhead = () => {
    if (canAddAtPlayhead) addClipAt(playheadMs);
  };
  const applyFix = (fix: ReelWarningFix) => {
    if (fix.kind === 'add-at-playhead') {
      addClipAtPlayhead();
      return;
    }
    setClips(current => keepClaimsWithSpeakers(current, fix.clips));
    setSelected(fix.select, fix.clips);
  };
  const moveClip = (index: number, direction: -1 | 1) => {
    const to = index + direction;
    if (to < 0 || to >= clips.length) return;
    setClips(current => {
      const next = [...current];
      [next[index], next[to]] = [next[to], next[index]];
      return next;
    });
    selectKey(clips[index].key);
  };

  // Back to the reel that is live now, which is not the one the page opened on when it changed under
  // the edit (another admin's publish, a re-render).
  const discard = () => {
    if (!source) return;
    adoptNextVersion.current = false;
    setBase(source.version);
    setSaved(source.clips);
    setClips(source.clips);
  };

  const submit = (kind: 'preview' | 'publish' | 'unlock') => {
    dispatch({ type: 'closePopover' });
    dispatch({ type: 'stop' });
    // A check's report is about that check: publishing or unlocking from it goes back to the transcript.
    // The admin is leaving it, at the click, whether or not the publish goes through.
    if (kind !== 'preview' && shown.panel === 'check') dispatch({ type: 'closePanel' });
    if (!(kind === 'publish' ? canPublish : kind === 'unlock' ? canUnlock : canQueue)) return;
    setQueueError(null);
    const body =
      kind === 'unlock'
        ? // `story`: the re-pick is a story reel like every other reel (runbook, "Back to automatic").
          { unlock: true, story: true, reason: 'Moments editor: return to automatic', ...(base && { base }) }
        : {
            preview: kind === 'preview',
            reason: kind === 'preview' ? 'Moments editor: preview' : 'Moments editor: hand-picked reel',
            reel: { clock: 'player' as const, ...manualReel(clips, words, turns), ...(base && { base }) },
          };
    queue.mutate(body, {
      onSuccess: queued => {
        if (!queued?.queued || !queued.request) {
          setQueueError(refusalMessage(queued?.refusal ?? 'not_queued'));
          // The reel moved on since the plan was read: read it again, so the editor shows where it
          // stands (a carried reel, say, and its Return to automatic) without a reload.
          if (queued?.refusal === 'reel_changed' || queued?.refusal === 'reel_being_reapplied') refreshAfterReel();
          return;
        }
        setTracked({ requestedAt: queued.request.requested_at, reelKey: reelKey(clips), sent: clips });
      },
      onError: error => setQueueError(queueErrorMessage(error)),
    });
  };

  const rootRef = React.useRef<HTMLDivElement>(null);
  useEditorKeyboard(rootRef, {
    popoverOpen: shown.popover !== null,
    onEscape: () => {
      if (escapeTarget(shown) === null) return false;
      dispatch({ type: 'settle', facts });
      dispatch({ type: 'escape' });
      return true;
    },
    // Space plays the reel once the editor has a player it can drive (GEO-3773, PR 1b).
  });

  // The check's report: above the transcript, or on its own once a check lands.
  const previewPanel = (
    <ReelPreviewPanel
      job={ours && job.preview ? job : null}
      stale={tracked !== null && tracked.reelKey !== reelKey(clips)}
      turns={turns}
      clips={tracked?.sent ?? []}
      flagged={flaggedClips}
      nameOf={nameOf}
    />
  );

  const title = debate.data?.claim.claim ?? null;
  if (!loaded || transcript.isPending) {
    const failed = plan.error ?? media.error ?? claims.error;
    return (
      <EditorShell title={title}>
        {failed && !isMediaAdminRefusal(failed) ? "Couldn't load this debate's reel. Reload to try again." : 'Loading…'}
      </EditorShell>
    );
  }

  const showJob = inFlight || (ours && job.kind !== 'none');
  // A hand-picked reel the media worker sent again itself after a re-render (geo-chat#352), which
  // no longer fits the new video: never this visit's request, so said whenever it is the latest.
  const reapplyFailed = !ours && job.kind === 'failed' && request?.manual_reel?.reapplied ? job : null;

  return (
    <EditorShell
      title={title}
      rootRef={rootRef}
      actions={
        <>
          <StatusPill job={job} dirty={dirty} handPicked={locked} noReel={unlinkable} />
          <Button variant="secondary" disabled={!canQueue} onClick={() => submit('preview')}>
            Preview
          </Button>
          <Button variant="secondary" disabled={!dirty || inFlight} onClick={discard}>
            Discard changes
          </Button>
          {canUnlock ? (
            <Button
              variant="secondary"
              disabled={queue.isPending}
              onClick={() => dispatch({ type: 'openPopover', popover: 'unlock' })}
            >
              Return to automatic
            </Button>
          ) : null}
          <Button disabled={!canPublish} onClick={() => dispatch({ type: 'openPopover', popover: 'publish' })}>
            Publish reel
            {warnings.length > 0 && dirty ? (
              <span
                aria-label={`${warnings.length} warning${warnings.length > 1 ? 's' : ''}`}
                className="ml-1 inline-grid h-[18px] min-w-[18px] place-items-center rounded bg-black px-[5px] text-[12px] text-white"
              >
                {warnings.length}
              </span>
            ) : null}
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
      {unlinkable ? (
        <UnlinkableNotice job={reapplyFailed} next={inFlight ? 'wait' : readOnly ? null : dirty ? 'publish' : 'pick'} />
      ) : reapplyFailed ? (
        <ReapplyFailedNotice job={reapplyFailed} />
      ) : null}
      {confirm === 'publish' ? (
        <ConfirmCard
          title="Publish this reel?"
          confirmLabel={warnings.length > 0 ? 'Publish anyway' : 'Publish and lock'}
          onCancel={() => dispatch({ type: 'closePopover' })}
          onConfirm={() => submit('publish')}
        >
          It&apos;s queued for the media worker, which renders the clips from the recordings.{' '}
          {unlinkable
            ? "The debate has no reel until that's done; then this reel plays for everyone and is locked, so"
            : "The live moments don't change until that's done; then this reel replaces them for everyone and is locked, so"}{' '}
          automatic picks and re-cuts leave it alone.
          {warnings.length > 0 ? (
            <span className={cx('mt-1 block', WAITING_TEXT_CLASS)}>
              {warnings.length} warning{warnings.length > 1 ? 's' : ''} still open:{' '}
              {warnings.map(warning => sentence(warning.title)).join(' ')}
            </span>
          ) : null}
        </ConfirmCard>
      ) : null}
      {confirm === 'unlock' ? (
        <ConfirmCard
          title="Return to automatic?"
          confirmLabel="Unlock and re-pick"
          onCancel={() => dispatch({ type: 'closePopover' })}
          onConfirm={() => submit('unlock')}
        >
          This unlocks the reel and queues a fresh automatic pick.{' '}
          {unlinkable
            ? 'The debate has no reel until the new clips are rendered.'
            : 'The hand-picked reel stays live until the new clips are rendered.'}
        </ConfirmCard>
      ) : null}
      {queueError ? <Notice tone="bad">{queueError}</Notice> : null}
      {showJob && !job.preview ? <JobNotice job={job} flagged={flaggedClips} noReel={unlinkable} /> : null}
      {wholeReelProblems.length > 0 ? (
        <Notice tone="bad">
          {wholeReelProblems.map(problem => (
            <span key={problem} className="block">
              {problem}
            </span>
          ))}
        </Notice>
      ) : null}
      {clips.length > 0 && !carried ? (
        <ReelWarningsPanel
          warnings={warnings}
          readOnly={readOnly}
          canAddAtPlayhead={canAddAtPlayhead}
          onFix={applyFix}
        />
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

          <ReelTimeline
            clips={clips}
            saved={saved ?? []}
            speakers={speakers}
            words={words}
            durationMs={durationMs}
            playheadMs={playheadMs}
            selected={selectedIndex}
            readOnly={readOnly}
            onSelect={index => setSelected(index)}
            onChangeClip={(index, span) => updateClip(index, clip => ({ ...clip, ...span }))}
            onSeek={seekTo}
            peaks={peaks.kind === 'ready' ? peaks.peaks : null}
          />

          <ReelWaveform
            view={peaks}
            clip={clips[selectedIndex] ?? null}
            index={selectedIndex}
            speaker={speakers[selectedIndex] ?? null}
            played={played[selectedIndex] ?? null}
            words={words}
            turns={turns}
            durationMs={durationMs}
            playheadMs={playheadMs}
            readOnly={readOnly}
            onChangeClip={(index, span) => updateClip(index, clip => ({ ...clip, ...span }))}
            onSeek={seekTo}
            onFullDebate={() => dispatch({ type: 'deselect' })}
          />

          <section className="rounded border border-grey-02 bg-white">
            <div className="flex items-center justify-between gap-2 border-b border-divider p-3">
              <Text as="h2" variant="smallTitle">
                Reel, in play order
              </Text>
              <AddClipButton count={clips.length} disabled={!canAddAtPlayhead} onAdd={addClipAtPlayhead} />
            </div>
            {clipViews.length === 0 ? (
              <Text as="p" variant="metadata" color="grey-04" className="p-3">
                No clips. Add one at the playhead or from the transcript.
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
                    selected={index === selectedIndex}
                    onSelect={() => setSelected(index)}
                    onMove={direction => moveClip(index, direction)}
                    isFirst={index === 0}
                    isLast={index === clipViews.length - 1}
                    onPlay={() => seekTo(played[index]?.start_ms ?? view.clip.start_ms)}
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

        {shown.panel === 'check' ? (
          <section aria-label="Check before publishing" className="flex min-w-0 flex-col gap-2">
            <div className="flex justify-end">
              <Button small variant="secondary" onClick={() => dispatch({ type: 'closePanel' })}>
                Back to the transcript
              </Button>
            </div>
            {previewPanel}
          </section>
        ) : (
          <div className="flex min-w-0 flex-col gap-4">
            {previewPanel}
            <ReelTranscript
              sentences={sentences}
              words={words}
              wordTiming={transcript.data?.word_timing}
              turns={turns}
              canAddClip={canAddClip}
              onAddClip={addClipAt}
              onSetClipWords={setClipWords}
              onAddClipWords={addClip}
              clips={clips}
              speakers={speakers}
              selected={selectedIndex}
              readOnly={readOnly}
              nameOf={nameOf}
              onChangeClip={(index, next) => updateClip(index, () => next)}
              onSeek={seekTo}
            />
          </div>
        )}
      </div>
    </EditorShell>
  );
}

/** Whether two clips are sent the same: the same cuts and claim. */
function clipKey(clip: EditorClip) {
  // A free edge is sent differently from a word edge at the same time (`manualReel`).
  const free = `${edgeIsFree(clip, 'start') ? 's' : ''}${edgeIsFree(clip, 'end') ? 'e' : ''}`;
  return `${clip.start_ms}-${clip.end_ms}-${clip.claim_index ?? ''}-${free}`;
}

/** Whether two reels are the same edit: the same cuts and claims, in the same order. */
function reelKey(clips: readonly EditorClip[]) {
  return clips.map(clipKey).join('|');
}

/** The turns' two clocks, which map the video's times onto the player's: equal keys, the same map. */
function turnClockKey(turns: readonly DebateMediaTurnSegment[]) {
  return turns
    .map(
      turn => `${turn.output_start_ms}-${turn.output_end_ms}-${turn.source_start_ms ?? ''}-${turn.source_end_ms ?? ''}`
    )
    .join('|');
}

/**
 * Why the editor is read-only, or `null`. The dry run's refusal says it for most cases; a transcript
 * without word timings is re-transcribed by every request and is then often skipped
 * (`transcript_differs`), so it is read-only until that is fixed (GEO-3642).
 */
export function editingBlockedReason(
  entry: (Pick<MomentBackfillEntry, 'refusal'> & Partial<Pick<MomentBackfillEntry, 'live_reel'>>) | null,
  wordTiming: boolean | undefined,
  planError: unknown,
  /** The transcript never loaded: without its words no edge snaps and no clip has a speaker or claim. */
  transcriptFailed = false,
  /** A request is queued or rendering: for a carried reel, usually the worker's own re-cut of it. */
  requestInFlight = false,
  /** An unsaved edit is on the reel: Return to automatic waits until it is discarded. */
  editPending = false
): string | null {
  if (planError) return "Couldn't check whether this debate can be edited. Reload to try again.";
  if (transcriptFailed) return "Couldn't load this debate's transcript. Reload to try again.";
  // Its clip times are on the old video's clock until the worker cuts it again on the new one.
  if (entry && reelCarried(entry)) {
    const carried =
      "A re-render carried this hand-picked reel over, and its clips are still cut on the video from before it, so they can't be edited, and the times and words shown for them are approximate.";
    // A re-cut on its way may well fit, and returning to automatic would throw the reel away.
    if (requestInFlight) return `${carried} A request for it is in the queue; this page updates when it's done.`;
    // An edit kept from before the carry (a publish refused `reel_being_reapplied`) can never be
    // published, and Return to automatic is hidden until it is gone.
    return editPending
      ? `${carried} Nothing is queued to cut it again. To pick it again, discard your changes, then return it to automatic and edit the reel that replaces it.`
      : `${carried} Nothing is queued to cut it again. To pick it again, return it to automatic, then edit the reel that replaces it.`;
  }
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
 * The claim a clip is sent with after an edit (`next`, from `previous`). A claim picked for one
 * speaker never rides along when the edit changes the clip's speaker; an edit that keeps the speaker
 * keeps the claim, so a live link the editor can't place on a speaker isn't silently dropped.
 */
export function keepClaimWithSpeaker(
  previous: Pick<EditorClip, 'start_ms' | 'end_ms' | 'claim_index'>,
  next: EditorClip,
  words: readonly ReelWord[],
  claimSlot: (index: number) => ParticipantSlot | null
): EditorClip {
  if (next.claim_index === null) return next;
  const speaker = clipSpeaker(words, next.start_ms, next.end_ms);
  // The clip's own claim, on the same speaker. A claim the edit sets (a pick, or a drag giving back
  // the claim it started with) is judged on whose it is.
  if (next.claim_index === previous.claim_index && speaker === clipSpeaker(words, previous.start_ms, previous.end_ms)) {
    return next;
  }
  return claimSlot(next.claim_index) === speaker ? next : { ...next, claim_index: null };
}

/**
 * The debate's claims each debater can link a clip to, and each claim's speaker, as geo-chat's
 * `manual_moments` takes a named claim: its fresh claims, then the `retained` ones (an earlier
 * extraction's, kept because they may be published), which a hand-picked clip may name too
 * (geo-chat#352: a carried clip keeps the published claim it was made for).
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
  const claims = (payload?.claims ?? []).map((claim, index) => ({ claim, index }));
  const fresh = claims.filter(({ claim }) => claim.retained !== true);
  const retained = claims.filter(({ claim }) => claim.retained === true);
  for (const { claim, index } of [...fresh, ...retained]) {
    const speaker = slotOfTurn.get(claim.turn_index);
    if (speaker !== 1 && speaker !== 2) continue;
    slot.set(index, speaker);
    const option: ClaimOption = { index, text: claim.text, ...(claim.retained === true && { retained: true }) };
    bySlot.set(speaker, [...(bySlot.get(speaker) ?? []), option]);
  }
  return { bySlot, slot };
}

/** A list of warnings as one sentence: ends in a full stop, never two. */
function sentence(text: string) {
  return /[.?!]$/.test(text) ? text : `${text}.`;
}

/**
 * Adds a clip at the playhead, under the clip cap (GEO-3773, D4): a reel aims for 4 clips and takes
 * up to 6. Under 4 it is the plain add; at 4 or 5 a compact one that names the clip it adds and says
 * why 4; at 6 there is none.
 */
export function AddClipButton({ count, disabled, onAdd }: { count: number; disabled: boolean; onAdd: () => void }) {
  if (count >= MANUAL_MAX_CLIPS) return null;
  if (count < REEL_CLIPS) {
    return (
      <Button small variant="secondary" disabled={disabled} onClick={onAdd}>
        + Add clip at playhead
      </Button>
    );
  }
  return (
    <Tooltip
      label={EXTRA_CLIP_TOOLTIP}
      trigger={
        // A disabled button takes no pointer events: the wrapper keeps the reason reachable.
        <span className="inline-flex" tabIndex={disabled ? 0 : undefined}>
          <Button
            small
            variant="secondary"
            disabled={disabled}
            className="border-dashed"
            aria-description={EXTRA_CLIP_TOOLTIP}
            onClick={onAdd}
          >
            Add a {ordinal(count + 1)} clip
          </Button>
        </span>
      }
    />
  );
}

function ordinal(n: number) {
  return n === 5 ? '5th' : n === 6 ? '6th' : `${n}th`;
}

function EditorShell({
  title,
  actions,
  rootRef,
  children,
}: {
  title: string | null;
  actions?: React.ReactNode;
  rootRef?: React.Ref<HTMLDivElement>;
  children: React.ReactNode;
}) {
  return (
    <div ref={rootRef} className="mx-auto flex w-full max-w-[1180px] flex-col gap-4 px-4 pt-8 pb-[120px]">
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
function StatusPill({
  job,
  dirty,
  handPicked,
  noReel,
}: {
  job: ReelJob;
  dirty: boolean;
  handPicked: boolean;
  /** Locked with no reel (geo-chat#352): viewers see none. */
  noReel: boolean;
}) {
  if (job.kind === 'queued') {
    return (
      <span className={cx(PILL_CLASS, 'bg-orange/15', WAITING_TEXT_CLASS)}>
        {job.preview ? 'Preview queued' : noReel ? 'Queued · no reel yet' : 'Queued · live reel unchanged'}
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
  if (noReel) return <span className={cx(PILL_CLASS, 'bg-red-02', NEGATIVE_TEXT_CLASS)}>Locked · no reel</span>;
  if (handPicked) return <span className={cx(PILL_CLASS, 'bg-text text-white')}>Hand-picked · locked</span>;
  return <span className={cx(PILL_CLASS, 'bg-grey-01 text-grey-04')}>Auto-picked</span>;
}

/** What became of a publish or a return to automatic. `flagged`: the clips it failed on, as numbered now. */
function JobNotice({ job, flagged, noReel }: { job: ReelJob; flagged: readonly number[]; noReel: boolean }) {
  if (job.kind === 'queued') {
    return (
      <Notice tone="wait">
        <b className="font-medium">Queued.</b> {noReel ? 'The debate has no reel' : 'The live reel stays as it is'}{' '}
        until the media worker renders the new clips. The queue can take a while; this page updates when it&apos;s done,
        and you can leave it.
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

/**
 * A hand-picked reel a re-render could not carry onto the new video (`reel_no_longer_fits`): what the
 * worker found, clip by clip as the reel stood, and that the reel needs picking again.
 */
function ReapplyFailedNotice({ job }: { job: Extract<ReelJob, { kind: 'failed' }> }) {
  return (
    <Notice tone="bad">
      <b className="font-medium">A re-render couldn&apos;t keep this hand-picked reel.</b> {job.summary}
      <WorkerProblems job={job} clipLabel="Clip" />
    </Notice>
  );
}

/**
 * Locked with no reel (geo-chat#352, `reel_unlinkable`): a re-render couldn't carry the hand-picked
 * reel, and nothing automatic took its place. `job`: the worker's refused re-submit, whose clips are
 * the lost reel's, not any shown here.
 */
function UnlinkableNotice({
  job,
  next,
}: {
  job: Extract<ReelJob, { kind: 'failed' }> | null;
  /**
   * The way out it offers: both (`pick`), the picked clips or discarding them (`publish`: an edit is
   * on the reel, and Return to automatic waits until it is gone), none until the request in the
   * queue is done (`wait`: the worker's re-submit of the lost reel, queued with the re-render), or
   * none (`null`: read-only, and the reason above says why).
   */
  next: 'pick' | 'publish' | 'wait' | null;
}) {
  return (
    <Notice tone="bad">
      <b className="font-medium">
        This hand-picked reel couldn&apos;t be carried over after a re-render, so the debate has no reel.
      </b>
      {next === 'pick' ? ' Pick new clips, or return to automatic.' : null}
      {next === 'publish' ? " Publish the clips you've picked, or discard them to return to automatic." : null}
      {next === 'wait'
        ? " A request for this debate is in the queue; you can pick new clips or return to automatic once it's done."
        : null}
      {job ? <WorkerProblems job={job} clipLabel="Lost reel, clip" /> : null}
    </Notice>
  );
}

/** The worker's problems with a reel it re-submitted, clip by clip as that reel stood. */
function WorkerProblems({ job, clipLabel }: { job: Extract<ReelJob, { kind: 'failed' }>; clipLabel: string }) {
  const problems = Object.entries(job.clips).flatMap(([at, found]) =>
    found.map(problem => `${clipLabel} ${Number(at) + 1}: ${problem}`)
  );
  return (
    <>
      {[...problems, ...job.other].map(problem => (
        <span key={problem} className="mt-1 block">
          {problem}
        </span>
      ))}
    </>
  );
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
