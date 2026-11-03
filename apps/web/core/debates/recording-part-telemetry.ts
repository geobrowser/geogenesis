import { captureSafely } from '~/core/analytics-capture-safely';

export type RecordingPartUploadContext = {
  debate_id: string;
  recording_started_at_ms: number;
  upload_phase: 'live' | 'queued';
};

/** One network attempt: start is emitted before PUT so a hung upload is visible too. */
export async function trackRecordingPartUpload(
  context: RecordingPartUploadContext | undefined,
  partNumber: number,
  bytes: number,
  put: () => Promise<void>
) {
  if (!context) return put();
  const started = Date.now();
  const timer = performance.now();
  const base = { ...context, part_number: partNumber, bytes, started_at_ms: started };
  const report = (phase: string) =>
    captureSafely('debate_recording_part_upload', {
      ...base,
      phase,
      ...(phase === 'started'
        ? {}
        : { ended_at_ms: Date.now(), elapsed_ms: Math.max(0, Math.round(performance.now() - timer)) }),
    });
  report('started');
  try {
    await put();
  } catch (error) {
    // Neither messages nor signed upload URLs belong in analytics.
    report((error as { name?: unknown } | null)?.name === 'AbortError' ? 'aborted' : 'failed');
    throw error;
  }
  report('completed');
}
