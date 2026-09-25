import { capture } from '~/core/analytics';

/**
 * Where a local recorder gave up (GEO-2843). `unsupported`: the browser has no `MediaRecorder`.
 * `construct` and `start`: the constructor or `start()` threw. `runtime`: the recorder started and
 * then fired `error`, after which `dataavailable` simply stops — the case that leaves a file with
 * complete audio and a dead video track.
 */
export type DebateRecorderFailureStage = 'unsupported' | 'construct' | 'start' | 'runtime';

type MediaRecorderConstructor = {
  new (stream: MediaStream, options?: MediaRecorderOptions): MediaRecorder;
  isTypeSupported(mimeType: string): boolean;
};

function globalMediaRecorder(): MediaRecorderConstructor | undefined {
  return typeof MediaRecorder === 'undefined' ? undefined : MediaRecorder;
}

export function preferredRecordingMimeType(Recorder: MediaRecorderConstructor | undefined = globalMediaRecorder()) {
  if (!Recorder) return '';
  for (const mimeType of ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm']) {
    if (Recorder.isTypeSupported(mimeType)) return mimeType;
  }
  return '';
}

/**
 * One event per failure, plus the console line the rest of the recording code leaves. Carries the
 * debate, the stage and the error's name and message only: nothing about the participant.
 */
export function reportDebateRecorderFailure({
  debateId,
  stage,
  mimeType,
  error,
}: {
  debateId: string;
  stage: DebateRecorderFailureStage;
  mimeType: string;
  error?: unknown;
}) {
  // Duck-typed rather than `instanceof Error`: a DOMException is not an Error in every engine.
  const errorLike = typeof error === 'object' && error !== null && 'name' in error && 'message' in error;
  const errorName = error === undefined ? null : errorLike ? String(error.name) : 'UnknownError';
  const errorMessage = error === undefined ? null : errorLike ? String(error.message) : String(error);
  console.warn(`[DebateRecording] local recorder failed at ${stage}:`, error ?? 'MediaRecorder is unavailable');
  try {
    capture('debate_recorder_failed', {
      debate_id: debateId,
      stage,
      mime_type: mimeType || 'none',
      error_name: errorName,
      error_message: errorMessage,
    });
  } catch {
    // Analytics is best-effort and must never affect capture.
  }
}

/**
 * A MediaRecorder `error` event carries its cause on `.error` (a DOMException); older engines
 * dispatched a bare Event. Report whichever is there.
 */
export function recorderErrorFromEvent(event: Event): unknown {
  const error = (event as Event & { error?: unknown }).error;
  return error ?? new Error(`MediaRecorder fired ${event.type}`);
}

/**
 * Constructs and starts a recorder, reporting rather than throwing if either step fails. `wire`
 * runs between the two so listeners are attached before any event can fire. Returns null on
 * failure, which leaves the caller exactly where an unsupported browser leaves it: no recorder,
 * so the pill never lights and there is nothing to persist. `report` lets the caller dedupe, since
 * the effect that starts capture re-runs whenever the debate refreshes.
 */
export function startDebateRecorder({
  stream,
  debateId,
  timesliceMs,
  wire,
  report = reportDebateRecorderFailure,
  Recorder = globalMediaRecorder(),
}: {
  stream: MediaStream;
  debateId: string;
  timesliceMs: number;
  wire: (recorder: MediaRecorder, mimeType: string) => void;
  report?: typeof reportDebateRecorderFailure;
  Recorder?: MediaRecorderConstructor;
}): { recorder: MediaRecorder; mimeType: string } | null {
  if (!Recorder) {
    report({ debateId, stage: 'unsupported', mimeType: '' });
    return null;
  }
  const mimeType = preferredRecordingMimeType(Recorder);
  let recorder: MediaRecorder;
  try {
    recorder = new Recorder(stream, mimeType ? { mimeType } : undefined);
  } catch (error) {
    report({ debateId, stage: 'construct', mimeType, error });
    return null;
  }
  recorder.addEventListener(
    'error',
    event =>
      report({
        debateId,
        stage: 'runtime',
        mimeType: recorder.mimeType || mimeType,
        error: recorderErrorFromEvent(event),
      }),
    { once: true }
  );
  wire(recorder, mimeType);
  try {
    recorder.start(timesliceMs);
  } catch (error) {
    report({ debateId, stage: 'start', mimeType: recorder.mimeType || mimeType, error });
    return null;
  }
  return { recorder, mimeType };
}
