import { captureSafely } from '~/core/analytics-capture-safely';

/** One network attempt: start is emitted before PUT so a hung upload is visible too. */
export async function trackRecordingPartUpload(
  context: { debate_id: string; recording_started_at_ms: number; upload_phase: 'live' | 'queued' },
  partNumber: number,
  bytes: number,
  put: () => Promise<void>
) {
  const started = Date.now();
  const base = { ...context, part_number: partNumber, bytes, started_at_ms: started };
  const report = (phase: string) =>
    captureSafely('debate_recording_part_upload', {
      ...base,
      phase,
      ...(phase === 'started' ? {} : { ended_at_ms: Date.now(), duration_ms: Date.now() - started }),
    });
  report('started');
  try {
    await put();
  } catch (error) {
    // Neither messages nor signed upload URLs belong in analytics.
    report('failed');
    throw error;
  }
  report('completed');
}
