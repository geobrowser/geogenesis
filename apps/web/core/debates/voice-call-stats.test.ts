import { describe, expect, it } from 'vitest';

import {
  MIC_LEVEL_FLOOR_DB,
  type ReceiverSnapshot,
  micKindOf,
  readReceiverReport,
  readSenderReport,
  voiceSampleMetrics,
} from './voice-call-stats';

const receivers = (entries: [string, ReceiverSnapshot][]) => new Map(entries);

describe('voiceSampleMetrics (GEO-3340)', () => {
  it('reports loss each way as a share of what was sent or due', () => {
    const metrics = voiceSampleMetrics(
      { packets: 1_100, packetsLost: 30, roundTripTime: 0.085, jitter: 0.012 },
      { packets: 100, packetsLost: 10 },
      receivers([['remote-a', { packets: 900, packetsLost: 100, samples: 48_000, concealedSamples: 4_800 }]]),
      receivers([['remote-a', { packets: 0, packetsLost: 0, samples: 0, concealedSamples: 0 }]])
    );
    // 20 lost of 1,000 sent + 20 lost.
    expect(metrics.send_loss_pct).toBe(2);
    expect(metrics.rtt_ms).toBe(85);
    expect(metrics.send_jitter_ms).toBe(12);
    expect(metrics.sent_packets).toBe(1_000);
    expect(metrics.recv_loss_pct).toBe(10);
    // A tenth of what was played had to be made up: audibly choppy.
    expect(metrics.recv_concealed_pct).toBe(10);
    expect(metrics.recv_tracks).toBe(1);
  });

  it('reads the microphone level as mean power over the interval', () => {
    // A steady level of 0.1 for two seconds: energy integrates level squared over time.
    const level = (seconds: number) => ({ energy: 0.01 * seconds, samplesDuration: seconds });
    expect(voiceSampleMetrics(level(12), level(10), new Map(), undefined).mic_level_db).toBe(-20);
  });

  it('reports a silent microphone at the floor rather than as no reading', () => {
    const metrics = voiceSampleMetrics(
      { energy: 0, samplesDuration: 30 },
      { energy: 0, samplesDuration: 0 },
      new Map(),
      undefined
    );
    expect(metrics.mic_level_db).toBe(MIC_LEVEL_FLOOR_DB);
  });

  // A mic switch republishes, and the new track's counters start from zero.
  it('treats a counter that went backwards as a new track', () => {
    const metrics = voiceSampleMetrics(
      { packets: 40, packetsLost: 0 },
      { packets: 5_000, packetsLost: 9 },
      new Map(),
      undefined
    );
    expect(metrics.sent_packets).toBe(40);
    expect(metrics.send_loss_pct).toBe(0);
  });

  // A lobby: one person leaving must not read as everyone else's counters dropping.
  it('measures each remote track against its own previous reading', () => {
    const metrics = voiceSampleMetrics(
      {},
      undefined,
      receivers([
        ['remote-a', { packets: 2_000, packetsLost: 0, samples: 96_000, concealedSamples: 0 }],
        ['remote-new', { packets: 500, packetsLost: 0, samples: 24_000, concealedSamples: 2_400 }],
      ]),
      receivers([
        ['remote-a', { packets: 1_000, packetsLost: 0, samples: 48_000, concealedSamples: 0 }],
        ['remote-gone', { packets: 9_000, packetsLost: 900, samples: 400_000, concealedSamples: 40_000 }],
      ])
    );
    expect(metrics.recv_tracks).toBe(2);
    expect(metrics.recv_loss_pct).toBe(0);
    // 2,400 concealed of 48,000 + 24,000 heard.
    expect(metrics.recv_concealed_pct).toBe(3.3);
  });

  it('reports nothing it could not measure', () => {
    expect(voiceSampleMetrics({}, undefined, new Map(), undefined)).toEqual({
      sent_packets: null,
      send_loss_pct: null,
      rtt_ms: null,
      send_jitter_ms: null,
      mic_level_db: null,
      recv_tracks: 0,
      recv_loss_pct: null,
      recv_concealed_pct: null,
      recv_jitter_ms: null,
    });
  });
});

describe('reading WebRTC stats reports', () => {
  it('picks our outbound audio, the remote view of it, and the mic level', () => {
    expect(
      readSenderReport([
        { type: 'outbound-rtp', kind: 'audio', packetsSent: 500 },
        { type: 'outbound-rtp', kind: 'video', packetsSent: 9_999 },
        { type: 'remote-inbound-rtp', kind: 'audio', packetsLost: 4, roundTripTime: 0.05, jitter: 0.01 },
        { type: 'media-source', kind: 'audio', totalAudioEnergy: 0.2, totalSamplesDuration: 10 },
        { type: 'candidate-pair', currentRoundTripTime: 1 },
      ])
    ).toEqual({ packets: 500, packetsLost: 4, roundTripTime: 0.05, jitter: 0.01, energy: 0.2, samplesDuration: 10 });
  });

  it('picks inbound audio for a remote track', () => {
    expect(
      readReceiverReport([
        {
          type: 'inbound-rtp',
          kind: 'audio',
          packetsReceived: 100,
          packetsLost: 2,
          totalSamplesReceived: 4_800,
          concealedSamples: 48,
          jitter: 0.02,
        },
        { type: 'inbound-rtp', kind: 'video', packetsReceived: 9_999 },
      ])
    ).toEqual({ packets: 100, packetsLost: 2, samples: 4_800, concealedSamples: 48, jitter: 0.02 });
  });

  it('reads an absent report as nothing measured', () => {
    expect(readSenderReport(undefined)).toEqual({});
    expect(readReceiverReport(undefined)).toEqual({});
  });
});

describe('micKindOf', () => {
  it.each([
    ['MacBook Pro Microphone (Built-in)', 'built_in'],
    ['Default - MacBook Air Microphone', 'built_in'],
    ['Microphone Array (Realtek(R) Audio)', 'built_in'],
    ['AirPods Pro', 'bluetooth'],
    ['Headset (WH-1000XM4 Hands-Free AG Audio)', 'bluetooth'],
    ['Jane’s iPhone Microphone', 'bluetooth'],
    ['Shure MV7', 'external'],
    ['Yeti Stereo Microphone (Blue)', 'external'],
    ['BlackHole 2ch', 'virtual'],
    ['Krisp Microphone', 'virtual'],
    ['', 'unknown'],
    [undefined, 'unknown'],
  ] as const)('%s → %s', (label, kind) => {
    expect(micKindOf(label)).toBe(kind);
  });
});
