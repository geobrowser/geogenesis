/** Video encoder diagnostics, alongside GEO-3340's audio metrics. No device or ICE addresses. */
type Entry = { id?: string; type?: string; kind?: string; [key: string]: unknown };
type Counters = { cpu?: number; bandwidth?: number };
export type VideoSnapshot = Map<string, Counters>;
const number = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) ? value : undefined);

export function videoSampleMetrics(entries: readonly Entry[], previous?: VideoSnapshot) {
  const snapshot: VideoSnapshot = new Map();
  const reasons: string[] = [];
  const cpu: number[] = [];
  const bandwidth: number[] = [];
  const fps: number[] = [];
  for (const entry of entries) {
    if (entry.type !== 'outbound-rtp' || entry.kind !== 'video') continue;
    const id = `${entry.id}:${entry.ssrc}`;
    const durations = entry.qualityLimitationDurations as Record<string, unknown> | undefined;
    const current = { cpu: number(durations?.cpu), bandwidth: number(durations?.bandwidth) };
    snapshot.set(id, current);
    for (const [key, values] of [
      ['cpu', cpu],
      ['bandwidth', bandwidth],
    ] as const) {
      const value = current[key];
      const before = previous?.get(id)?.[key];
      // Missing earlier counters are unknown, and a reset starts a fresh baseline.
      if (value !== undefined && (!previous?.has(id) || before !== undefined)) {
        values.push(Math.max(0, value - (before ?? 0)) * 1_000);
      }
    }
    if (typeof entry.qualityLimitationReason === 'string') reasons.push(entry.qualityLimitationReason);
    const frames = number(entry.framesPerSecond);
    if (frames !== undefined) fps.push(frames);
  }
  // Simulcast encodings run concurrently. Report the worst duration, not their sum.
  return {
    snapshot,
    metrics: {
      quality_limitation_reason: ['bandwidth', 'cpu', 'other', 'none'].find(reason => reasons.includes(reason)) ?? null,
      quality_limitation_cpu_ms: cpu.length ? Math.round(Math.max(...cpu)) : null,
      quality_limitation_bandwidth_ms: bandwidth.length ? Math.round(Math.max(...bandwidth)) : null,
      send_video_fps: fps.length ? Math.max(...fps) : null,
    },
  };
}
