'use client';

import * as React from 'react';

import { useToast } from '~/core/hooks/use-toast';

import { Text } from '~/design-system/text';

import type { DebateMediaTurnSegment, ParticipantSlot } from '../api';
import { GeoChatRequestError } from '../api';
import { DebateFeedPlayer, type DebateFeedPlayerHandle } from '../browse/debate-feed-player';
import { useInlinePlaybackUnavailable } from '../browse/inline-playback';
import { MOMENTS_EDITOR_CLOSEABLE_PARAM, debatePath } from '../debate-routes';
import { useDebate, useDebateExtractedClaims, useDebateMedia, useGeoChatAuth } from '../hooks';
import { speakerStillUrl } from '../speaker-still';
import { type MomentBackfillEntry, reelCarried, reelUnlinkable } from './api';
import { ClipPanel } from './clip-panel';
import { DebateLane } from './debate-lane';
import { EditorBanner, bannerFor } from './editor-banner';
import { EditorHeader, statusOf } from './editor-header';
import { EditorMonitor, type PlaybackRate } from './editor-monitor';
import {
  type EditorFacts,
  type EditorSelection,
  INITIAL_EDITOR_STATE,
  editorReducer,
  editorView,
  escapeTarget,
  selectedKey,
} from './editor-state';
import { ClipChip, PILL_CLASS, WarnIcon } from './editor-ui';
import {
  isMediaAdminRefusal,
  useAudioPeaks,
  useMomentBackfill,
  useMomentReelPlan,
  useMomentsTranscript,
  useQueueMomentReel,
  useRefreshAfterReel,
} from './hooks';
import { type TranscriptGate, pinnedTranscriptVersion, transcriptBlockedReason } from './moments-transcript';
import {
  type EditorClip,
  MANUAL_MAX_CLIPS,
  type ReelWord,
  type ServedMoment,
  clipFromWords,
  clipProblems,
  clipQuote,
  clipSpeaker,
  clipsFromLiveReel,
  clipsFromServedMoments,
  edgeIsFree,
  formatReelTime,
  formatWholeTime,
  manualReel,
  newClipKey,
  playedCuts,
  playerWords,
  reelProblems,
  snapEdge,
  stepEdge,
} from './reel';
import { ReelPreviewPanel } from './reel-preview-panel';
import { jobInFlight, reelJob, refusalBlocksEditing, refusalMessage } from './reel-status';
import { type ClaimChoice, ClaimOptions, type ClipCardView, ReelStrip } from './reel-strip';
import {
  NO_TRANSCRIPT_ACTIONS,
  ReelTranscript,
  type TranscriptActions,
  type TranscriptNames,
  reelSentences,
} from './reel-transcript';
import { REEL_CLIPS, type ReelWarningFix, reelWarnings } from './reel-warnings';
import { type Pad, ReelWaveform } from './reel-waveform';
import { ClipPicker, PanelHead, PanelScroll, SidePanel, WarningsList, warningText } from './side-panel';
import type { ClaimOption } from './speaker-classes';
import { useEditorKeyboard } from './use-editor-keyboard';
import { reelSegments, usePlayRange } from './use-play-range';
import { usePlayheadFrame, usePlayheadText } from './use-playhead-frame';

/** What a new clip at the playhead runs for, before it is trimmed. */
const NEW_CLIP_MS = 15_000;

export { EXTRA_CLIP_TOOLTIP } from './reel-strip';

const NO_TURNS: DebateMediaTurnSegment[] = [];
/**
 * The moments editor (GEO-3671): a media admin fine-tunes a debate's moment reel, previews exactly
 * what the media worker would publish, then publishes it and watches it go live. Every time here is
 * on the debate player's clock; geo-chat converts the reel itself (`clock: "player"`).
 *
 * geo-chat is the gate: its admin read answers 403 to anyone off the media-admin list, and the page
 * shows nothing of the editor until that read has answered.
 */
/**
 * `closeable` (GEO-3742): the editor was opened in a tab of its own, from the Best debates popup, so
 * its header has a Done that closes the tab and leaves the ranker where they were.
 */
export function MomentsEditor({ debateId, closeable = false }: { debateId: string; closeable?: boolean }) {
  return (
    <EditorCloseableContext.Provider value={closeable}>
      <MomentsEditorBody debateId={debateId} />
    </EditorCloseableContext.Provider>
  );
}

const EditorCloseableContext = React.createContext(false);

/**
 * Closes the editor's tab, which the popup opened with `window.open`. A browser only lets a script
 * close a tab a script opened, and `?close=1` travels with a copied link, a bookmark or a restored
 * tab: there the close does nothing, so the editor drops `?close=1` and stays, without its Done.
 */
export function closeEditorTab() {
  window.close();
  window.setTimeout(() => {
    if (window.closed) return;
    const url = new URL(window.location.href);
    url.searchParams.delete(MOMENTS_EDITOR_CLOSEABLE_PARAM);
    window.location.replace(url.toString());
  }, 100);
}

export { RESTORE_FAILED_EDIT_LABEL } from './editor-banner';

/** Done, for a tab opened from the popup: off while there are changes not published or discarded. */
function DoneButton({ dirty = false }: { dirty?: boolean }) {
  const closeable = React.useContext(EditorCloseableContext);
  if (!closeable) return null;
  return (
    <button
      type="button"
      className={PILL_CLASS}
      disabled={dirty}
      title={dirty ? 'Publish or discard your changes first' : undefined}
      onClick={closeEditorTab}
      data-geo-analytics-label="Moments editor done"
    >
      Done
    </button>
  );
}

function MomentsEditorBody({ debateId }: { debateId: string }) {
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
  // The words the editor snaps edges to and counts speakers with, and the sentences it lists
  // (GEO-3349); for a debate published without words, a fresh transcription of it (GEO-3642).
  const transcript = useMomentsTranscript(debateId, true);
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

  // The player, played through its handle (GEO-3773). Null on the combined-video fallback.
  const player = React.useRef<DebateFeedPlayerHandle>(null);
  const inlineUnavailable = useInlinePlaybackUnavailable();
  const [rate, setRate] = React.useState<PlaybackRate>(1);
  const [playerState, setPlayerState] = React.useState({ playing: false, failed: false });
  const onPlaybackState = React.useCallback(
    (state: { playing: boolean; error: boolean; autoplayBlocked: boolean }) =>
      setPlayerState(current =>
        current.playing === state.playing && current.failed === (state.error || state.autoplayBlocked)
          ? current
          : { playing: state.playing, failed: state.error || state.autoplayBlocked }
      ),
    []
  );
  const [soundBlocked, setSoundBlocked] = React.useState(false);
  const range = usePlayRange({
    handle: player,
    rate,
    playing: playerState.playing,
    failed: playerState.failed,
    clipsKey: `${clips.map(clip => clip.key).join(',')}#${reelKey(clips)}`,
  });
  /** Clips the last Play skipped because they start after the video has ended (a carried reel's). */
  const [pastEnd, setPastEnd] = React.useState<{ skipped: number; of: number } | null>(null);
  const startRange = (id: string, segments: Parameters<typeof range.start>[1]) => {
    const skipped = range.start(id, segments).length;
    setPastEnd(skipped > 0 ? { skipped, of: segments.length } : null);
  };
  const frame = usePlayheadFrame(player, playerState.playing);
  const timeReadout = usePlayheadText(frame, formatReelTime);
  const playingRef = React.useRef(playerState.playing);
  playingRef.current = playerState.playing;

  const [playheadMs, setPlayheadMs] = React.useState<number | null>(null);
  const onRangePlayhead = range.onPlayhead;
  const setFrame = frame.set;
  const onPlayheadChange = React.useCallback(
    (seconds: number) => {
      onRangePlayhead(seconds * 1000);
      setPlayheadMs(Math.round(seconds * 1000));
      // Paused, nothing reads the position each frame: the report moves the time readout.
      if (!playingRef.current) setFrame(Math.round(seconds * 1000));
    },
    [onRangePlayhead, setFrame]
  );
  const [seek, setSeek] = React.useState<{ ms: number; nonce: number } | null>(null);
  /** Moves the player only: what plays and what the monitor says are the caller's. */
  const moveTo = (ms: number) => {
    if (player.current) {
      player.current.seek(ms);
      frame.set(ms);
    } else setSeek(previous => ({ ms, nonce: (previous?.nonce ?? 0) + 1 }));
  };
  /** Ends what plays, and the transport's message about the last Play goes with it. The one place
   * that does: a seek, a pause, a select and a play from the picker all end a run through it. */
  const endPlay = (how: 'stop' | 'seeked' = 'stop') => {
    range.stop();
    setPastEnd(null);
    // `seeked` is judged against the reducer's own playback, not this render's: a select that
    // stopped the reel a moment ago has already put its clip back.
    if (how === 'seeked') dispatch({ type: 'seeked' });
    else if (view.playback.mode !== 'idle') dispatch({ type: 'stop' });
  };
  // A seek ends a playing reel where the admin asked, not back on the clip it started from, and
  // with nothing selected (`seeked`): what plays on from there is the full debate.
  const seekTo = (ms: number) => {
    endPlay('seeked');
    moveTo(ms);
  };

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
    preview: boolean;
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
    transcript.data,
    plan.error,
    transcriptFailed,
    inFlight,
    dirty,
    // How long the debate runs, for a transcription that is taking longer than that.
    turns.length > 0 ? Math.max(...turns.map(turn => turn.source_end_ms ?? turn.output_end_ms)) : undefined
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
  // Each clip's speaker, once per edit: the strip, the monitor and the side transcript read this one
  // list (memoised, so the transcript doesn't re-render for a new list of the same speakers).
  const speakers = React.useMemo(
    () => clips.map(clip => clipSpeaker(words, clip.start_ms, clip.end_ms)),
    [clips, words]
  );
  const clipViews = clips.map((clip, index) => {
    const speaker = speakers[index];
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
  // Nothing is edited while a request is in flight either: a clip's pickers and menus close for it.
  const editLocked = readOnly || inFlight;
  const facts: EditorFacts = { checkShown: showsCheck, readOnly: editLocked, canPublish, canUnlock };
  const shown = editorView(view, { keys: clipKeyList === '' ? [] : clipKeyList.split('|'), ...facts });
  // What the facts closed stays closed (it doesn't come back when they allow it again).
  React.useEffect(() => {
    dispatch({ type: 'settle', facts: { checkShown: showsCheck, readOnly: editLocked, canPublish, canUnlock } });
  }, [view, showsCheck, editLocked, canPublish, canUnlock]);

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
  const clipsRef = React.useRef(clips);
  clipsRef.current = clips;
  const playedRef = React.useRef(played);
  playedRef.current = played;
  // What Play reel plays: the played cuts, or a carried reel's clip spans (`reelSegments`).
  const reelPlayable = React.useMemo(() => reelSegments(clips, played, carried), [carried, clips, played]);
  // None for a carried reel: like its clip checks, they would read its old-video cuts at the places
  // the new video's turns map them to, and it is read-only, so there is nothing to fix.
  const warnings = carried ? [] : reelWarnings(clips, words, nameOf);

  // The header's button and the warning's fix alike: without a playhead there is nowhere to add it.
  // A new clip starts at the playhead or at a transcript sentence. The transcript is the way in when
  // there is no playhead, as on the combined-video fallback, and no clip to select, as on a debate
  // locked without a reel.
  const canAddClip = !editLocked && clips.length < MANUAL_MAX_CLIPS;
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
    // The moved clip becomes the selected one; moving the selected clip keeps what is open about it.
    if (clips[index].key !== selected) selectKey(clips[index].key);
  };

  // Back to the reel that is live now, which is not the one the page opened on when it changed under
  // the edit (another admin's publish, a re-render).
  const discard = () => {
    if (!source) return;
    adoptNextVersion.current = false;
    // A refusal was about the edit that is gone now.
    setQueueError(null);
    dispatch({ type: 'discarded', keys: source.clips.map(clip => clip.key) });
    setBase(source.version);
    setSaved(source.clips);
    setClips(source.clips);
  };

  // A publish that failed after its visit ended (GEO-3742: the popup's tab closes with Done while it
  // renders, and its toast says to open Edit moments): shown here as if this visit had sent it, and
  // its clips can be brought back as an unsaved edit, with the worker's problems on them.
  const failedElsewhere =
    !ours &&
    !tracked &&
    request &&
    job.kind === 'failed' &&
    !request.preview &&
    !request.unlock &&
    // The worker's own resend after a re-render has a notice of its own (`UnlinkableNotice`), and a
    // batch or automatic re-cut has no hand-picked clips: neither is a publish from here.
    !request.manual_reel?.reapplied &&
    (request.manual_reel?.clips?.length ?? 0) > 0
      ? request
      : null;
  const failedClips = failedElsewhere?.manual_reel?.clock === 'player' ? failedElsewhere.manual_reel.clips : undefined;
  const restoreFailedEdit =
    failedElsewhere && failedClips && failedClips.length > 0 && !readOnly && !dirty
      ? () => {
          // The edges as sent. A reel sent `exact` had every edge placed freely, so each stays where it
          // is (`edgeIsFree`); otherwise they are word edges, and geo-chat adds its room again.
          const exact = failedElsewhere.manual_reel?.exact === true;
          const restored: EditorClip[] = failedClips.map(clip => ({
            key: newClipKey(),
            start_ms: clip.start_ms,
            end_ms: clip.end_ms,
            ...(exact && { free_start_ms: clip.start_ms, free_end_ms: clip.end_ms }),
            claim_index: typeof clip.claim_index === 'number' ? clip.claim_index : null,
            live_claim_text: null,
          }));
          setClips(restored);
          setTracked({
            requestedAt: failedElsewhere.requested_at,
            reelKey: reelKey(restored),
            sent: restored,
            preview: false,
          });
        }
      : null;

  const transcriptVersion = pinnedTranscriptVersion(transcript.data);
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
            reel: {
              clock: 'player' as const,
              ...manualReel(clips, words, turns),
              ...(base && { base }),
              // Words from a fresh transcription: cut on exactly those, or refused (`transcript_changed`).
              ...(transcriptVersion && { transcript_version: transcriptVersion }),
            },
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
        setTracked({
          requestedAt: queued.request.requested_at,
          reelKey: reelKey(clips),
          sent: clips,
          preview: kind === 'preview',
        });
      },
      onError: error => setQueueError(queueErrorMessage(error)),
    });
  };

  const [snap, setSnap] = React.useState(true);
  const [pad, setPad] = React.useState<Pad>(2_000);

  // What plays (GEO-3773): the reel is the view state's (its selection comes back when it stops);
  // the range is the player's. A reel whose range has ended or stopped is over.
  const reelPlaying = view.playback.mode === 'reel';
  const reelKeyNow = reelPlaying && range.state.kind !== 'idle' && range.state.id === 'reel' ? range.state.key : null;
  /** Back where the admin was before Play reel: the selected clip's start. Both callers have stopped
   * the reel already, and a "past the end of the video" message from its start stays. */
  const seekReturnTo = (back: EditorSelection) => {
    const at = back.kind === 'clip' ? clipsRef.current.findIndex(clip => clip.key === back.key) : -1;
    if (at >= 0) moveTo(playedRef.current[at]?.start_ms ?? clipsRef.current[at].start_ms);
  };
  // The reel played to its end (or every clip was skipped). A Stop or a seek ends it themselves.
  React.useEffect(() => {
    if (view.playback.mode !== 'reel' || range.state.kind !== 'idle') return;
    const back = view.playback.returnTo;
    dispatch({ type: 'stop' });
    seekReturnTo(back);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view.playback, range.state.kind]);
  // A clip with no played cut plays its raw span (§3.6), said for as long as its range runs; a
  // carried reel's clips all do, as approximate, so it isn't said there.
  const rangeId = range.state.kind === 'idle' ? null : range.state.id;
  const rangeClip = rangeId === null ? -1 : clips.findIndex(clip => `clip:${clip.key}` === rangeId);
  const rawSpan = rangeClip >= 0 && played[rangeClip] === null && !carried;
  const stopPlayback = () => {
    endPlay();
    if (playerState.playing) player.current?.pause();
  };
  const playReel = () => {
    if (view.playback.mode === 'reel') {
      // Stop goes back to the clip the reel started from, as its end does (the prototype's playReel).
      const back = view.playback.returnTo;
      stopPlayback();
      seekReturnTo(back);
      return;
    }
    if (inlineUnavailable || reelPlayable.length === 0) return;
    dispatch({ type: 'playReel', keys: reelPlayable.map(segment => segment.key), list: clips.map(clip => clip.key) });
    startRange('reel', reelPlayable);
  };
  /** Plays one clip as it will be cut, from the playhead when that is inside it. */
  const playClip = (index: number, fromPlayhead: boolean) => {
    const clip = clips[index];
    if (!clip) return;
    const span = played[index] ?? clip;
    if (inlineUnavailable) {
      seekTo(span.start_ms);
      return;
    }
    if (view.playback.mode !== 'idle') dispatch({ type: 'stop' });
    const live = player.current?.livePositionMs() ?? null;
    const from =
      fromPlayhead && live !== null && live >= span.start_ms && live < span.end_ms - 100 ? live : span.start_ms;
    startRange(`clip:${clip.key}`, [{ key: clip.key, start_ms: from, end_ms: span.end_ms }]);
  };
  /** Picks a clip: what plays stops, and the player goes to where the clip starts. */
  const selectClip = (key: string, seek = true) => {
    stopPlayback();
    selectKey(key);
    const at = clips.findIndex(clip => clip.key === key);
    if (seek && at >= 0) seekTo(played[at]?.start_ms ?? clips[at].start_ms);
  };
  const stepClip = (direction: -1 | 1) => {
    if (reelPlaying) {
      const at = reelPlayable.findIndex(segment => segment.key === reelKeyNow);
      const to = Math.max(0, Math.min(reelPlayable.length - 1, at + direction));
      startRange('reel', reelPlayable.slice(to));
      return;
    }
    if (clips.length === 0) return;
    const from = selectedIndex >= 0 ? selectedIndex : 0;
    selectClip(clips[Math.max(0, Math.min(clips.length - 1, from + direction))].key);
  };
  const transport = () => {
    if (inlineUnavailable) return;
    if (range.state.kind === 'stalled') {
      range.retry();
      return;
    }
    if (playerState.playing || range.active) {
      stopPlayback();
      return;
    }
    if (selectedIndex >= 0) {
      playClip(selectedIndex, true);
      return;
    }
    // Nothing selected: the debate plays until paused (decision D1).
    endPlay();
    player.current?.play();
  };
  /** Plays from a sentence in the picker, until paused. */
  const playFrom = (ms: number) => {
    if (inlineUnavailable) return seekTo(ms);
    // Whatever played stops without a pause: the pair plays on from the sentence, in this click.
    endPlay();
    player.current?.play();
    player.current?.jumpTo(ms);
  };

  const removeClip = (index: number) => {
    const removed = clips[index];
    if (!removed) return;
    stopPlayback();
    // The clip that takes its place is selected, as the prototype does; a flagged one keeps the claim
    // panel open on it (its claim is what needs fixing).
    const next = clips[index + 1] ?? clips[index - 1];
    if (removed.key === selected && next) selectKey(next.key);
    setClips(current => current.filter(clip => clip.key !== removed.key));
  };
  const replaceWith = (fromMs: number) => {
    const index = selectedIndex;
    const clip = clips[index];
    if (!clip) return;
    const span = clipFromWords(
      words,
      fromMs,
      clip.end_ms - clip.start_ms,
      turns,
      clips.filter((_, at) => at !== index)
    );
    if (!span) return;
    updateClip(index, ({ free_start_ms: _start, free_end_ms: _end, ...rest }) => ({
      ...rest,
      start_ms: span.start_ms,
      end_ms: span.end_ms,
    }));
    dispatch({ type: 'closePanel' });
    seekTo(span.start_ms);
  };
  const addFrom = (fromMs: number) => {
    const span = clipFromWords(words, fromMs, NEW_CLIP_MS, turns, clips);
    if (span) addClip({ start_ms: span.start_ms, end_ms: span.end_ms });
  };
  const pickerFrom = (fromMs: number) => (shown.panel === 'replace' ? replaceWith(fromMs) : addFrom(fromMs));
  const livePlayhead = () => player.current?.livePositionMs() ?? playheadMs;

  // The side transcript (GEO-3773) renders only when what it shows changes, not on each playhead
  // report or edit elsewhere: its data is memoised here and its actions come through a ref.
  const name1 = nameOf(1);
  const name2 = nameOf(2);
  const transcriptNames = React.useMemo((): TranscriptNames => ({ 1: name1, 2: name2 }), [name1, name2]);
  // What the selected clip played before it was edited: the live reel's span, outlined ("was").
  const liveOfSelected = selected === null ? undefined : saved?.find(clip => clip.key === selected);
  const nowSelected = selectedIndex >= 0 ? clips[selectedIndex] : undefined;
  const wasEdited =
    liveOfSelected !== undefined &&
    nowSelected !== undefined &&
    (liveOfSelected.start_ms !== nowSelected.start_ms || liveOfSelected.end_ms !== nowSelected.end_ms);
  const wasStart = wasEdited ? liveOfSelected.start_ms : null;
  const wasEnd = wasEdited ? liveOfSelected.end_ms : null;
  const transcriptWas = React.useMemo(
    () => (wasStart === null || wasEnd === null ? null : { start_ms: wasStart, end_ms: wasEnd }),
    [wasStart, wasEnd]
  );
  const transcriptActions = React.useRef<TranscriptActions>(NO_TRANSCRIPT_ACTIONS);
  transcriptActions.current = {
    selectClip: key => selectClip(key),
    seekWord: ms => {
      stopPlayback();
      seekTo(ms);
    },
    seek: seekTo,
    changeClip: (index, next) => updateClip(index, () => next),
    setClipWords,
    addClipWords: addClip,
    playing: () => playingRef.current,
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
    onSpace: () => {
      if (!inlineUnavailable) playReel();
    },
  });

  const title = debate.data?.claim.claim ?? null;
  if (!loaded || transcript.isPending) {
    const failed = plan.error ?? media.error ?? claims.error;
    return (
      <EditorShell title={title}>
        {failed && !isMediaAdminRefusal(failed) ? "Couldn't load this debate's reel. Reload to try again." : 'Loading…'}
      </EditorShell>
    );
  }

  // The reel this visit sent to publish, while it is rendering or live (not failed, not a preview).
  const publishedEdits = tracked && !tracked.preview && ours && job.kind !== 'failed' ? tracked.reelKey : null;
  // A hand-picked reel the media worker sent again itself after a re-render (geo-chat#352), which
  // no longer fits the new video: never this visit's request, so said whenever it is the latest.
  const reapplyFailed = !ours && job.kind === 'failed' && request?.manual_reel?.reapplied ? job : null;
  const banner = bannerFor({
    queueError,
    failed: ours && job.kind === 'failed' && !job.preview ? job : null,
    failedElsewhere: failedElsewhere && job.kind === 'failed' ? job : null,
    canRestore: restoreFailedEdit !== null,
    flagged: flaggedClips,
    reapplyFailed,
    unlinkable,
    carried,
    readOnlyReason,
    wholeReelProblems,
    dirty,
    inFlight,
    canUnlock,
  });

  const nameFor = (slot: ParticipantSlot | null) => nameOf(slot) ?? 'No speaker';
  const savedByKey = new Map((saved ?? []).map(clip => [clip.key, clip]));
  /** The claim the live reel links a clip to, where it is placed on one of the debate's claims. */
  const liveClaimOf = (key: string) => {
    const live = savedByKey.get(key);
    return live && live.live_claim_text !== null ? live.claim_index : null;
  };
  const claimTextOf = (clip: EditorClip) => {
    if (clip.claim_index === null) return clip.live_claim_text ?? 'Closest claim (automatic)';
    const text = (payload?.claims ?? [])[clip.claim_index]?.text;
    return text ?? clip.live_claim_text ?? `Claim ${clip.claim_index + 1}`;
  };
  const clipWarning = (index: number) => warnings.find(warning => warning.clip === index) ?? null;
  const cards: ClipCardView[] = clipViews.map((view, index) => {
    const live = savedByKey.get(view.clip.key);
    return {
      key: view.clip.key,
      speaker: view.speaker,
      name: nameFor(view.speaker),
      quote: view.quote || 'No whole words in this range.',
      lengthMs: view.clip.end_ms - view.clip.start_ms,
      edited: (saved?.length ?? 0) > 0 && (!live || clipKey(live) !== clipKey(view.clip)),
      warning: clipWarning(index)?.title ?? null,
      bad: view.problems.length > 0,
      claimText: claimTextOf(view.clip),
      claimTag:
        view.clip.claim_index === null
          ? view.clip.live_claim_text
            ? 'Live now'
            : null
          : view.clip.claim_index === liveClaimOf(view.clip.key)
            ? 'Live now'
            : 'Picked',
      claimIndex: view.clip.claim_index,
    };
  });
  const selectedClip = selectedIndex >= 0 ? clips[selectedIndex] : null;
  const selectedView = selectedIndex >= 0 ? clipViews[selectedIndex] : null;
  const claimChoices: ClaimChoice[] = (() => {
    if (!selectedView) return [];
    const options = selectedView.speaker === null ? [] : (claimOptions.bySlot.get(selectedView.speaker) ?? []);
    const claim = selectedView.clip.claim_index;
    // The live reel's link, kept when it isn't one of the speaker's claims as the editor counts them.
    const extra =
      claim !== null && !options.some(option => option.index === claim)
        ? [{ index: claim, text: claimTextOf(selectedView.clip) }]
        : [];
    const live = liveClaimOf(selectedView.clip.key);
    return [...options, ...extra].map(option => ({ ...option, live: option.index === live }));
  })();
  const pickClaim = (claimIndex: number | null) => {
    if (selectedIndex < 0) return;
    updateClip(selectedIndex, clip => ({ ...clip, claim_index: claimIndex }));
    dispatch({ type: 'closePopover' });
    if (shown.panel === 'claim') dispatch({ type: 'closePanel' });
  };

  const editable = !editLocked && !reelPlaying;
  const totalMs = clips.reduce((sum, clip) => sum + (clip.end_ms - clip.start_ms), 0);
  const reelLength = warnings.find(warning => warning.id === 'reel-length');
  const firstBad = clipViews.findIndex(view => view.problems.length > 0);
  const reelIndex = reelKeyNow === null ? -1 : clips.findIndex(clip => clip.key === reelKeyNow);
  const monitorLabel =
    reelPlaying && reelIndex >= 0
      ? { text: `Reel · clip ${reelIndex + 1} of ${clips.length}`, speaker: speakers[reelIndex] ?? null }
      : selectedView
        ? { text: `Clip ${selectedIndex + 1} · ${nameFor(selectedView.speaker)}`, speaker: selectedView.speaker }
        : { text: 'Full debate', speaker: null };
  const notice =
    range.state.kind === 'stalled'
      ? "Couldn't continue — Play to retry"
      : pastEnd
        ? pastEndText(pastEnd)
        : rawSpan
          ? 'Not in the published video — playing the raw span'
          : null;
  const unlockPopover = () => dispatch({ type: 'openPopover', popover: 'unlock' });

  const sidePanel = (() => {
    const close = () => dispatch({ type: 'closePanel' });
    switch (shown.panel) {
      case 'claim':
        if (!selectedView) return null;
        return (
          <>
            <PanelHead
              title={`Clip ${selectedIndex + 1}’s claim`}
              chip={<ClipChip number={selectedIndex + 1} speaker={selectedView.speaker} />}
              onClose={close}
              extra={
                selectedView.problems.length > 0 ? (
                  <div className="flex items-start gap-2 text-red-01">
                    <WarnIcon className="mt-0.5" />
                    <span className="text-metadataMedium">{capitalise(sentence(selectedView.problems[0]))}</span>
                  </div>
                ) : null
              }
            />
            <PanelScroll>
              <div className="py-1">
                <ClaimOptions
                  name={nameFor(selectedView.speaker)}
                  choices={claimChoices}
                  current={{ claimIndex: selectedView.clip.claim_index }}
                  onPick={pickClaim}
                />
              </div>
            </PanelScroll>
          </>
        );
      case 'replace':
      case 'add':
        return (
          <ClipPicker
            mode={shown.panel}
            number={shown.panel === 'add' ? clips.length + 1 : selectedIndex + 1}
            sentences={sentences}
            clips={clips}
            speakers={speakers}
            target={
              shown.panel === 'replace' && selectedClip
                ? { index: selectedIndex, speaker: speakers[selectedIndex] ?? null, start_ms: selectedClip.start_ms }
                : null
            }
            nameOf={nameOf}
            focusMs={shown.panel === 'replace' && selectedClip ? selectedClip.start_ms : livePlayhead()}
            canUsePlayhead={livePlayhead() !== null}
            onUse={sentence => pickerFrom(sentence.start_ms)}
            onUsePlayhead={() => {
              const at = livePlayhead();
              if (at !== null) pickerFrom(at);
            }}
            onPlayFrom={playFrom}
            onClose={close}
          />
        );
      case 'check':
        return (
          <>
            <PanelHead title="Check before publishing" onClose={close} />
            <PanelScroll>
              <div className="px-4 pt-3 pb-4">
                <ReelPreviewPanel
                  job={ours && job.preview ? job : null}
                  stale={tracked !== null && tracked.reelKey !== reelKey(clips)}
                  turns={turns}
                  clips={tracked?.sent ?? []}
                  flagged={flaggedClips}
                  nameOf={nameOf}
                  onCheckAgain={() => submit('preview')}
                />
              </div>
            </PanelScroll>
          </>
        );
      case 'warnings':
        return (
          <WarningsList
            warnings={warnings}
            speakers={speakers}
            readOnly={editLocked}
            canAddAtPlayhead={canAddAtPlayhead}
            onFix={applyFix}
            onClose={close}
          />
        );
      case 'transcript':
        return (
          <ReelTranscript
            sentences={sentences}
            words={words}
            wordTiming={transcript.data?.word_timing}
            turns={turns}
            clips={clips}
            speakers={speakers}
            selected={reelPlaying ? -1 : selectedIndex}
            was={reelPlaying ? null : transcriptWas}
            editable={editable}
            readOnly={editLocked}
            snap={snap}
            names={transcriptNames}
            subscribe={frame.subscribe}
            actions={transcriptActions}
          />
        );
    }
  })();

  const bottom =
    selectedClip && selectedView && !reelPlaying ? (
      <ClipPanel
        number={selectedIndex + 1}
        speaker={selectedView.speaker}
        name={nameFor(selectedView.speaker)}
        lengthMs={selectedClip.end_ms - selectedClip.start_ms}
        startMs={selectedClip.start_ms}
        endMs={selectedClip.end_ms}
        warning={(() => {
          const warning = readOnly ? null : clipWarning(selectedIndex);
          if (!warning) return null;
          const fix = warning.fix;
          return {
            text: warning.title,
            fix: fix
              ? {
                  label: fix.label,
                  disabled: !editable || (fix.kind === 'add-at-playhead' && !canAddAtPlayhead),
                  onFix: () => applyFix(fix),
                }
              : null,
          };
        })()}
        editable={editable}
        locked={editLocked}
        replaceOpen={shown.panel === 'replace'}
        advancedOpen={shown.popover === 'advanced'}
        snap={snap}
        pad={pad}
        canMoveEarlier={selectedIndex > 0}
        canMoveLater={selectedIndex < clips.length - 1}
        canStep={words.length > 0}
        waveform={
          <ReelWaveform
            view={peaks}
            clip={selectedClip}
            index={selectedIndex}
            speaker={speakers[selectedIndex] ?? null}
            played={played[selectedIndex] ?? null}
            words={words}
            turns={turns}
            durationMs={durationMs}
            playheadMs={playheadMs}
            readOnly={!editable}
            pad={pad}
            snap={snap}
            onSnap={() => setSnap(on => !on)}
            onChangeClip={(index, span) => updateClip(index, clip => ({ ...clip, ...span }))}
            onSeek={seekTo}
          />
        }
        onPlay={() => playClip(selectedIndex, false)}
        onReplace={() => dispatch({ type: 'togglePanel', panel: 'replace' })}
        onRemove={() => removeClip(selectedIndex)}
        onAdvanced={open => dispatch(open ? { type: 'openPopover', popover: 'advanced' } : { type: 'closePopover' })}
        onSetEdge={(edge, ms) =>
          updateClip(selectedIndex, clip => {
            const at = snap ? snapEdge(ms, words, edge) : ms;
            return edge === 'start' ? { ...clip, start_ms: at } : { ...clip, end_ms: at };
          })
        }
        onSnap={() => setSnap(on => !on)}
        onMove={direction => moveClip(selectedIndex, direction)}
        onPad={setPad}
        onFullDebate={() => dispatch({ type: 'deselect' })}
        onStep={(edge, direction) =>
          updateClip(selectedIndex, clip => {
            const at = stepEdge(edge === 'start' ? clip.start_ms : clip.end_ms, words, edge, direction);
            return edge === 'start' ? { ...clip, start_ms: at } : { ...clip, end_ms: at };
          })
        }
      />
    ) : (
      <DebateLane
        clips={clips.map((clip, index) => ({
          key: clip.key,
          speaker: speakers[index] ?? null,
          name: nameFor(speakers[index] ?? null),
          quote: clipViews[index]?.quote ?? '',
          start_ms: clip.start_ms,
          end_ms: clip.end_ms,
        }))}
        strongKey={reelPlaying ? reelKeyNow : selected}
        durationMs={durationMs}
        peaks={peaks.kind === 'ready' ? peaks.peaks : null}
        stills={{
          1: speakerStillUrl(debateId, 1, media.data?.artifacts),
          2: speakerStillUrl(debateId, 2, media.data?.artifacts),
        }}
        playheadMs={playheadMs}
        subscribe={frame.subscribe}
        onSelect={key => selectClip(key)}
        onSeek={seekTo}
      />
    );

  return (
    <EditorShell title={title} rootRef={rootRef} full>
      <EditorHeader
        title={title ?? ''}
        debaters={participants
          .filter(participant => participant.participant_slot === 1 || participant.participant_slot === 2)
          .map(participant => ({
            slot: participant.participant_slot as 1 | 2,
            name: participant.display_name ?? `Debater ${participant.participant_slot}`,
          }))}
        viewHref={debate.data ? debatePath(debate.data) : null}
        status={statusOf({
          job,
          dirty,
          handPicked: locked,
          noReel: unlinkable,
          handPickedAt: handPicked?.requested_at ?? null,
        })}
        approximate={carried ? 'carried' : source?.approximate === true ? 'served' : null}
        canDiscard={dirty && !inFlight}
        onDiscard={discard}
        canUnlock={canUnlock}
        unlockPending={queue.isPending}
        popover={
          shown.popover === 'menu' || shown.popover === 'publish' || shown.popover === 'unlock' ? shown.popover : null
        }
        onPopover={popover => dispatch(popover === null ? { type: 'closePopover' } : { type: 'openPopover', popover })}
        warningCount={warnings.length}
        canCheck={canQueue}
        onCheck={() => submit('preview')}
        onWarnings={() => dispatch({ type: 'openPanel', panel: 'warnings' })}
        canPublish={canPublish}
        publishTip={
          canPublish
            ? null
            : firstBad >= 0
              ? `Fix clip ${firstBad + 1} to publish`
              : clips.length === 0
                ? 'Add a clip to publish'
                : null
        }
        publishConfirm={{
          body: unlinkable
            ? 'The debate has no reel until the clips are rendered. Then this reel plays for everyone and stays locked.'
            : 'The live moments don’t change until the clips are rendered. Then this reel replaces them for everyone and stays locked.',
          warnings:
            warnings.length > 0
              ? `${warnings.length} warning${warnings.length > 1 ? 's' : ''} still open: ${warnings.map(warning => sentence(warning.title)).join(' ')}`
              : null,
        }}
        unlockConfirm={
          unlinkable
            ? 'This unlocks the reel and queues a fresh automatic pick. The debate has no reel until the new clips are rendered.'
            : 'This unlocks the reel and queues a fresh automatic pick. The hand-picked reel stays live until the new clips are rendered.'
        }
        onPublish={() => submit('publish')}
        // The reel on screen was sent to publish and hasn't failed: Done needn't wait for the render
        // (the popup's tab follows it). An edit made since still has to be dealt with.
        done={<DoneButton dirty={dirty && publishedEdits !== reelKey(clips)} />}
        onUnlock={() => submit('unlock')}
      />
      {banner ? (
        <EditorBanner
          banner={banner}
          onSee={number => {
            const clip = clips[number - 1];
            if (!clip) return;
            selectClip(clip.key);
            dispatch({ type: 'openPanel', panel: 'claim' });
          }}
          onUnlock={unlockPopover}
          onDiscard={discard}
          onRestore={restoreFailedEdit ?? undefined}
        />
      ) : null}
      <ReelStrip
        clips={cards}
        selectedKey={reelPlaying ? null : selected}
        reel={reelPlaying && reelKeyNow !== null ? { segments: reelPlayable, key: reelKeyNow } : null}
        totalMs={totalMs}
        over70Tip={reelLength ? warningText(reelLength) : null}
        clipCountWarning={
          clips.length > REEL_CLIPS ? (warnings.find(warning => warning.id === 'clip-count')?.title ?? null) : null
        }
        readOnly={readOnly}
        addOpen={shown.panel === 'add'}
        canAdd={canAddClip}
        claimMenuOpen={shown.popover === 'claimMenu'}
        claimChoices={claimChoices}
        claimDisabled={!editable}
        subscribe={frame.subscribe}
        canPlay={!inlineUnavailable}
        onPlayReel={playReel}
        onSelect={key => selectClip(key)}
        onClaim={() => dispatch({ type: 'openPanel', panel: 'claim' })}
        onClaimMenu={open => dispatch(open ? { type: 'openPopover', popover: 'claimMenu' } : { type: 'closePopover' })}
        onPickClaim={pickClaim}
        onAdd={() => {
          stopPlayback();
          dispatch({ type: 'startAdd' });
        }}
      />
      <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_360px] gap-4 max-[899px]:grid-cols-1">
        <div className="flex min-h-0 min-w-0 flex-col gap-3">
          <EditorMonitor
            player={
              debate.data ? (
                <DebateFeedPlayer
                  ref={player}
                  debate={debate.data}
                  active
                  framed
                  editorMode
                  forceSound
                  cutTransitions
                  measure={false}
                  playbackRate={rate}
                  pauseBreakCuts={range.active}
                  onJumpTransition={range.onTransition}
                  onPlaybackState={onPlaybackState}
                  onSoundBlockedChange={setSoundBlocked}
                  // Where the combined-video fallback has no handle: a seek the editor asks for,
                  // applied once per request (the player latches on the value, so a repeat to the
                  // same time is told apart by a negligible offset).
                  initialSeekSeconds={seek ? seek.ms / 1000 + seek.nonce * 1e-6 : null}
                  onPlayheadChange={onPlayheadChange}
                />
              ) : null
            }
            label={monitorLabel}
            // Only between a reel's clips: a single clip's start holds too, but nothing is "next".
            loading={range.state.kind === 'playing' && range.state.loading && range.state.index > 0}
            timeRef={timeReadout}
            durationText={formatWholeTime(durationMs)}
            playing={(playerState.playing || range.active) && range.state.kind !== 'stalled'}
            disabled={inlineUnavailable}
            rate={rate}
            notice={notice}
            soundBlocked={soundBlocked}
            onUnmute={() => player.current?.unmute()}
            onPrev={() => stepClip(-1)}
            onNext={() => stepClip(1)}
            onPlayPause={transport}
            onRate={setRate}
          />
          {bottom}
        </div>
        <SidePanel panel={shown.panel}>{sidePanel}</SidePanel>
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

/** What a Play that skipped clips past the end of the video says. */
function pastEndText({ skipped, of }: { skipped: number; of: number }) {
  if (skipped === of)
    return of === 1 ? 'This clip is past the end of the video' : 'These clips are past the end of the video';
  return `Skipped ${skipped} ${skipped === 1 ? 'clip' : 'clips'} past the end of the video`;
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
 * Why the editor is read-only, or `null`. The dry run's refusal says it for most cases. A transcript
 * without word timings is edited on a fresh transcription geo-chat saves for it (GEO-3642): until
 * that is ready, and agrees with the published one, the reel is read-only (`transcriptBlockedReason`).
 */
export function editingBlockedReason(
  entry: (Pick<MomentBackfillEntry, 'refusal'> & Partial<Pick<MomentBackfillEntry, 'live_reel'>>) | null,
  transcript: TranscriptGate | undefined,
  planError: unknown,
  /** The transcript never loaded: without its words no edge snaps and no clip has a speaker or claim. */
  transcriptFailed = false,
  /** A request is queued or rendering: for a carried reel, usually the worker's own re-cut of it. */
  requestInFlight = false,
  /** An unsaved edit is on the reel: Return to automatic waits until it is discarded. */
  editPending = false,
  /** How long the debate runs: a transcription for editing waiting longer is said to be slow. */
  debateMs?: number
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
  return transcriptBlockedReason(transcript, debateMs);
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

function capitalise(text: string) {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/**
 * The editor's page (GEO-3773): the full height under the navbar, no page scroll, 1440 px at most.
 * Below 900 px wide it stacks and the page scrolls. The loading and refusal states use it too.
 */
function EditorShell({
  title,
  rootRef,
  full = false,
  children,
}: {
  title: string | null;
  rootRef?: React.Ref<HTMLDivElement>;
  /** The editor itself, rather than a one-line state. */
  full?: boolean;
  children: React.ReactNode;
}) {
  if (!full) {
    return (
      <div className="mx-auto flex w-full max-w-[1440px] flex-col gap-2 p-4">
        <span className="text-breadcrumb text-grey-04">Edit moments</span>
        {title ? <h1 className="m-0 text-largeTitle">{title}</h1> : null}
        {typeof children === 'string' ? <Text variant="body">{children}</Text> : children}
        {/* A tab opened from the popup can still be closed when the editor can't show. */}
        <div>
          <DoneButton />
        </div>
      </div>
    );
  }
  return (
    <div
      ref={rootRef}
      data-testid="moments-editor"
      className="mx-auto flex h-[calc(100dvh-2.75rem)] min-h-[600px] w-full max-w-[1440px] flex-col gap-3 overflow-hidden bg-white p-4 max-[899px]:h-auto max-[899px]:overflow-visible"
    >
      {children}
    </div>
  );
}
