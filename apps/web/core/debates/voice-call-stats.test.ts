import { describe, expect, it } from 'vitest';

import {
  MIC_LEVEL_FLOOR_DB,
  type ReceiverSnapshot,
  micKindOf,
  readReceiverReport,
  readSenderReport,
  readTransport,
  voiceSampleMetrics,
} from './voice-call-stats';

const receivers = (entries: [string, ReceiverSnapshot][]) => new Map(entries);

describe('voiceSampleMetrics (GEO-3340)', () => {
  it('reports loss each way as a share of what was sent or due', () => {
    const metrics = voiceSampleMetrics(
      { packets: 1_100, packetsLost: 110, roundTripTime: 0.085, jitter: 0.012 },
      { packets: 100, packetsLost: 10 },
      receivers([['remote-a', { packets: 900, packetsLost: 100, samples: 48_000, concealedSamples: 4_800 }]]),
      receivers([['remote-a', { packets: 0, packetsLost: 0, samples: 0, concealedSamples: 0 }]])
    );
    // 100 lost of the 1,000 sent: `packetsSent` already includes what was lost, so this is 10%, not
    // 100 of 1,100.
    expect(metrics.send_loss_pct).toBe(10);
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

  // Copilot on #2884: LiveKit switches mics with `replaceTrack`, which keeps the RTP stream and its
  // packet counters while the new mic is a new media source whose level counters start again.
  it('keeps the packet baseline across a mic switch on the same stream', () => {
    const metrics = voiceSampleMetrics(
      { streamId: '1', sourceId: 'source-2', packets: 11_000, packetsLost: 100, energy: 0.0004, samplesDuration: 0.4 },
      { streamId: '1', sourceId: 'source-1', packets: 10_000, packetsLost: 0, energy: 2, samplesDuration: 120 },
      new Map(),
      undefined
    );
    expect(metrics.sent_packets).toBe(1_000);
    expect(metrics.send_loss_pct).toBe(10);
    // 0.0004 over 0.4 s is a mean power of 0.001: -30 dB, read from the new source alone.
    expect(metrics.mic_level_db).toBe(-30);
  });

  it('starts the packet counters over on a new stream', () => {
    const metrics = voiceSampleMetrics(
      { streamId: '2', sourceId: 'source-2', packets: 40, packetsLost: 0 },
      { streamId: '1', sourceId: 'source-1', packets: 5_000, packetsLost: 9 },
      new Map(),
      undefined
    );
    expect(metrics.sent_packets).toBe(40);
    expect(metrics.send_loss_pct).toBe(0);
  });

  // Copilot on #2884: a cumulative loss count is negative when duplicates outnumber losses, and a
  // first reading has no earlier one to clamp against.
  it('reads a negative first loss count as no loss, not negative loss', () => {
    const metrics = voiceSampleMetrics(
      { packets: 100, packetsLost: -2 },
      undefined,
      receivers([['remote-a', { packets: 100, packetsLost: -2 }]]),
      undefined
    );
    expect(metrics.send_loss_pct).toBe(0);
    expect(metrics.recv_loss_pct).toBe(0);
  });

  // Copilot on #2884 (round 3): the server's first loss report can land after our first packet
  // count. Lifetime loss over one interval's packets would read 4.5% as 50%.
  it('leaves loss unmeasured when the previous reading had no loss count yet', () => {
    const metrics = voiceSampleMetrics(
      { streamId: '1', packets: 1_100, packetsLost: 50 },
      { streamId: '1', packets: 1_000 },
      receivers([
        ['remote-a:9', { streamId: '9', packets: 2_000, packetsLost: 40, samples: 96_000, concealedSamples: 960 }],
      ]),
      receivers([['remote-a:9', { streamId: '9', packets: 1_000, samples: 48_000 }]])
    );
    expect(metrics.sent_packets).toBe(100);
    expect(metrics.send_loss_pct).toBeNull();
    expect(metrics.recv_loss_pct).toBeNull();
    expect(metrics.recv_concealed_pct).toBeNull();
  });

  // RTCP's cumulative loss shrinks when packets thought lost turn up late.
  it('reads a shrinking loss count as no new loss, not a restart', () => {
    const metrics = voiceSampleMetrics(
      { packets: 2_000, packetsLost: 7 },
      { packets: 1_000, packetsLost: 9 },
      new Map(),
      undefined
    );
    expect(metrics.send_loss_pct).toBe(0);
  });

  // DTX stops sending while someone is quiet, and filling that silence is not choppiness.
  it('leaves concealment during silence out of what sounded choppy', () => {
    const metrics = voiceSampleMetrics(
      {},
      undefined,
      receivers([['remote-a', { samples: 48_000, concealedSamples: 30_000, silentConcealedSamples: 28_800 }]]),
      undefined
    );
    // 1,200 audible of 48,000.
    expect(metrics.recv_concealed_pct).toBe(2.5);
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
        { type: 'outbound-rtp', kind: 'audio', packetsSent: 500, ssrc: 1234, mediaSourceId: 'source-1' },
        { type: 'outbound-rtp', kind: 'video', packetsSent: 9_999 },
        { type: 'remote-inbound-rtp', kind: 'audio', packetsLost: 4, roundTripTime: 0.05, jitter: 0.01 },
        { type: 'media-source', kind: 'audio', totalAudioEnergy: 0.2, totalSamplesDuration: 10 },
        { type: 'candidate-pair', currentRoundTripTime: 1 },
      ])
    ).toEqual({
      streamId: '1234',
      sourceId: 'source-1',
      packets: 500,
      packetsLost: 4,
      roundTripTime: 0.05,
      jitter: 0.01,
      energy: 0.2,
      samplesDuration: 10,
    });
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
          silentConcealedSamples: 12,
          jitter: 0.02,
        },
        { type: 'inbound-rtp', kind: 'video', packetsReceived: 9_999 },
      ])
    ).toEqual({
      packets: 100,
      packetsLost: 2,
      samples: 4_800,
      concealedSamples: 48,
      silentConcealedSamples: 12,
      jitter: 0.02,
    });
  });

  it('reads an empty report as nothing measured', () => {
    expect(readSenderReport([])).toEqual({});
    expect(readReceiverReport([])).toEqual({});
  });
});

describe('readTransport (GEO-3343)', () => {
  const report = (local: Record<string, unknown>) => [
    { id: 'T1', type: 'transport', selectedCandidatePairId: 'CP1' },
    { id: 'CP0', type: 'candidate-pair', localCandidateId: 'L0', nominated: false },
    { id: 'CP1', type: 'candidate-pair', localCandidateId: 'L1', nominated: true },
    { id: 'L0', type: 'local-candidate', protocol: 'udp', candidateType: 'host' },
    { id: 'L1', type: 'local-candidate', ...local },
  ];

  it('reads the selected pair rather than any other', () => {
    expect(readTransport(report({ protocol: 'tcp', candidateType: 'host' }))).toBe('tcp');
    expect(readTransport(report({ protocol: 'udp', candidateType: 'srflx' }))).toBe('udp');
  });

  it('names a relay by the protocol it reaches the relay over', () => {
    expect(readTransport(report({ protocol: 'udp', candidateType: 'relay', relayProtocol: 'tls' }))).toBe('relay_tls');
    expect(readTransport(report({ protocol: 'udp', candidateType: 'relay' }))).toBe('relay');
  });

  // Firefox has no transport entry; the nominated pair is the one in use.
  it('falls back to the nominated pair when there is no transport entry', () => {
    expect(readTransport(report({ protocol: 'tcp', candidateType: 'host' }).slice(1))).toBe('tcp');
  });

  // Firefox can leave an earlier pair nominated after moving to another; `selected` is the one in use.
  it('prefers the pair Firefox marks selected over one only nominated', () => {
    expect(
      readTransport([
        { id: 'CP0', type: 'candidate-pair', localCandidateId: 'L0', nominated: true },
        { id: 'CP1', type: 'candidate-pair', localCandidateId: 'L1', nominated: true, selected: true },
        { id: 'L0', type: 'local-candidate', protocol: 'udp', candidateType: 'host' },
        { id: 'L1', type: 'local-candidate', protocol: 'tcp', candidateType: 'host' },
      ])
    ).toBe('tcp');
  });

  it('reads nothing before a pair is chosen', () => {
    expect(readTransport([{ id: 'T1', type: 'transport' }])).toBeNull();
    expect(readTransport([])).toBeNull();
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
