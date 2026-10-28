import { describe, expect, it } from 'vitest';

import { videoSampleMetrics } from './video-call-stats';

const video = (cpu: number, bandwidth: number, ssrc = 1) => ({
  id: `v${ssrc}`,
  ssrc,
  kind: 'video',
  type: 'outbound-rtp',
  qualityLimitationReason: 'cpu',
  qualityLimitationDurations: { cpu, bandwidth },
});

describe('video encoder limitation stats', () => {
  it('uses interval counters, milliseconds and the worst simultaneous encoding', () => {
    const before = videoSampleMetrics([video(2, 1), video(4, 2, 2)]);
    const after = videoSampleMetrics(
      [video(3, 5), { ...video(6, 7, 2), qualityLimitationReason: 'bandwidth' }],
      before.snapshot
    );
    expect(after.metrics).toMatchObject({
      quality_limitation_reason: 'bandwidth',
      quality_limitation_cpu_ms: 2000,
      quality_limitation_bandwidth_ms: 5000,
    });
  });
  it('does not mistake unsupported stats for a healthy call', () => {
    expect(videoSampleMetrics([]).metrics).toEqual({
      quality_limitation_reason: null,
      quality_limitation_cpu_ms: null,
      quality_limitation_bandwidth_ms: null,
      send_video_fps: null,
    });
  });
  it('starts a new baseline when the camera stream changes', () => {
    const before = videoSampleMetrics([video(8, 9)]);
    expect(videoSampleMetrics([video(1, 2, 2)], before.snapshot).metrics).toMatchObject({
      quality_limitation_cpu_ms: 1000,
      quality_limitation_bandwidth_ms: 2000,
    });
  });
  it('keeps a previously absent duration unknown for that interval', () => {
    const before = videoSampleMetrics([{ id: 'v1', ssrc: 1, kind: 'video', type: 'outbound-rtp' }]);
    expect(videoSampleMetrics([video(8, 9)], before.snapshot).metrics.quality_limitation_cpu_ms).toBeNull();
  });
});
