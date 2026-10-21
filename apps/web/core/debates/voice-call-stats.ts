/**
 * Pure arithmetic for voice call telemetry (GEO-3340): turns two WebRTC stats snapshots into what a
 * sample reports, and a microphone's label into a kind. No React and no LiveKit, so every rule is
 * testable from plain objects.
 */

/** Cumulative counters for our own microphone. Absent where the browser did not report them. */
export type SenderSnapshot = {
  /**
   * The RTP stream (SSRC) the packet counters belong to. A new stream starts them again.
   */
  streamId?: string;
  /**
   * The mic source the level counters belong to. LiveKit switches mics with `replaceTrack`, which
   * keeps the stream and its packet counts but brings a new source whose level counters start again,
   * so the two reset independently.
   */
  sourceId?: string;
  /** Outbound audio packets, everything sent whether it arrived or not. */
  packets?: number;
  /** What the server reports it never got of ours (remote-inbound-rtp). */
  packetsLost?: number;
  /** Seconds. */
  jitter?: number;
  /** Seconds. */
  roundTripTime?: number;
  /** The microphone's own signal (media-source), before encoding. */
  energy?: number;
  samplesDuration?: number;
};

/** Cumulative counters for one remote audio track. */
export type ReceiverSnapshot = {
  /** The RTP stream (SSRC) the counters belong to. */
  streamId?: string;
  packets?: number;
  packetsLost?: number;
  samples?: number;
  /** Samples the browser had to invent because packets came late or never: what choppy sounds like. */
  concealedSamples?: number;
  /**
   * The part of those invented during silence. DTX stops sending while someone is quiet, so this is
   * expected and inaudible, and is left out of `recv_concealed_pct`.
   */
  silentConcealedSamples?: number;
  /** Seconds. */
  jitter?: number;
};

/** Remote audio tracks by track id, so one person joining or leaving does not skew the others. */
export type ReceiverSnapshots = ReadonlyMap<string, ReceiverSnapshot>;

/** What one sample reports, null wherever there was nothing to measure. */
export type VoiceSampleMetrics = {
  sent_packets: number | null;
  send_loss_pct: number | null;
  rtt_ms: number | null;
  send_jitter_ms: number | null;
  /** The microphone's mean level over the interval, in dBFS. Near the floor means silence or a dead mic. */
  mic_level_db: number | null;
  recv_tracks: number;
  recv_loss_pct: number | null;
  recv_concealed_pct: number | null;
  /** The worst across everyone heard. */
  recv_jitter_ms: number | null;
};

/** Digital silence has no finite level; it is reported as this. */
export const MIC_LEVEL_FLOOR_DB = -100;

/**
 * The growth of a cumulative counter since the previous reading of the same stream. A counter that
 * went backwards has not restarted (that shows as a new stream): RTCP's lost count can shrink when
 * late packets turn up, which is no new loss.
 *
 * With no earlier reading of the stream, the whole count is this interval's. With an earlier reading
 * that lacked this counter, the interval's share is unknown: the server's first loss report can land
 * after our first packet count, and its lifetime total over one interval's packets reads 4.5% as 50%.
 */
function growth(current: number | undefined, previous: number | undefined, readBefore: boolean) {
  if (current === undefined) return null;
  if (previous === undefined) return readBefore ? null : Math.max(0, current);
  // A cumulative loss count is negative when duplicates outnumber losses.
  return Math.max(0, current - previous);
}

function sum(values: (number | null)[]) {
  const present = values.filter((value): value is number => value !== null);
  return present.length === 0 ? null : present.reduce((total, value) => total + value, 0);
}

function percent(part: number | null, whole: number | null) {
  return part === null || whole === null || whole <= 0 ? null : round((100 * part) / whole, 1);
}

const ms = (seconds?: number) => (seconds === undefined ? null : Math.round(seconds * 1_000));

function round(value: number, digits: number) {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
}

export function voiceSampleMetrics(
  sender: SenderSnapshot,
  previousSender: SenderSnapshot | undefined,
  receivers: ReceiverSnapshots,
  previousReceivers: ReceiverSnapshots | undefined
): VoiceSampleMetrics {
  const sameStream = previousSender?.streamId === sender.streamId ? previousSender : undefined;
  const sameSource = previousSender?.sourceId === sender.sourceId ? previousSender : undefined;
  const sent = growth(sender.packets, sameStream?.packets, sameStream !== undefined);
  const sentLost = growth(sender.packetsLost, sameStream?.packetsLost, sameStream !== undefined);
  const energy = growth(sender.energy, sameSource?.energy, sameSource !== undefined);
  const micSeconds = growth(sender.samplesDuration, sameSource?.samplesDuration, sameSource !== undefined);

  const tracks = [...receivers.entries()];
  const across = (read: (current: ReceiverSnapshot, previous?: ReceiverSnapshot) => number | null) =>
    sum(tracks.map(([id, current]) => read(current, previousReceivers?.get(id))));
  const received = across((current, previous) => growth(current.packets, previous?.packets, previous !== undefined));
  const receivedLost = across((current, previous) =>
    growth(current.packetsLost, previous?.packetsLost, previous !== undefined)
  );
  const samples = across((current, previous) => growth(current.samples, previous?.samples, previous !== undefined));
  const concealed = across((current, previous) => {
    const all = growth(current.concealedSamples, previous?.concealedSamples, previous !== undefined);
    const silent = growth(current.silentConcealedSamples, previous?.silentConcealedSamples, previous !== undefined);
    return all === null ? null : Math.max(0, all - (silent ?? 0));
  });
  const jitters = tracks.flatMap(([, current]) => (current.jitter === undefined ? [] : [current.jitter]));

  return {
    sent_packets: sent,
    // `packetsSent` already counts what never arrived, unlike the receive side's `packetsReceived`.
    send_loss_pct: percent(sentLost, sent),
    rtt_ms: ms(sender.roundTripTime),
    send_jitter_ms: ms(sender.jitter),
    // `totalAudioEnergy` integrates the squared level over time, so energy over seconds is mean power.
    mic_level_db:
      energy === null || micSeconds === null || micSeconds <= 0
        ? null
        : energy <= 0
          ? MIC_LEVEL_FLOOR_DB
          : Math.max(MIC_LEVEL_FLOOR_DB, round(10 * Math.log10(energy / micSeconds), 1)),
    recv_tracks: tracks.length,
    recv_loss_pct: percent(receivedLost, received === null || receivedLost === null ? null : received + receivedLost),
    recv_concealed_pct: percent(concealed, samples),
    recv_jitter_ms: jitters.length === 0 ? null : ms(Math.max(...jitters)),
  };
}

type StatsEntry = { id?: string; type?: string; kind?: string; [field: string]: unknown };

/** A report's entries, read once: transport lookups follow ids between them. */
export function statsEntries(report: { values(): Iterable<StatsEntry> } | undefined): StatsEntry[] {
  return report ? [...report.values()] : [];
}

const num = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) ? value : undefined);
const add = (total: number | undefined, value: unknown) => {
  const n = num(value);
  return n === undefined ? total : (total ?? 0) + n;
};
const isAudio = (entry: StatsEntry) => entry.kind === undefined || entry.kind === 'audio';

/** Our microphone's sender report: outbound packets, the server's view of them, and the source level. */
export function readSenderReport(entries: readonly StatsEntry[]): SenderSnapshot {
  const snapshot: SenderSnapshot = {};
  for (const entry of entries) {
    if (!isAudio(entry)) continue;
    if (entry.type === 'outbound-rtp') {
      snapshot.packets = add(snapshot.packets, entry.packetsSent);
      if (entry.ssrc !== undefined) snapshot.streamId = String(entry.ssrc);
      if (typeof entry.mediaSourceId === 'string') snapshot.sourceId = entry.mediaSourceId;
    } else if (entry.type === 'remote-inbound-rtp') {
      snapshot.packetsLost = add(snapshot.packetsLost, entry.packetsLost);
      snapshot.roundTripTime = num(entry.roundTripTime) ?? snapshot.roundTripTime;
      snapshot.jitter = num(entry.jitter) ?? snapshot.jitter;
    } else if (entry.type === 'media-source') {
      snapshot.energy = add(snapshot.energy, entry.totalAudioEnergy);
      snapshot.samplesDuration = add(snapshot.samplesDuration, entry.totalSamplesDuration);
    }
  }
  return snapshot;
}

/** One remote audio track's receiver report. */
export function readReceiverReport(entries: readonly StatsEntry[]): ReceiverSnapshot {
  const snapshot: ReceiverSnapshot = {};
  for (const entry of entries) {
    if (entry.type !== 'inbound-rtp' || !isAudio(entry)) continue;
    if (entry.ssrc !== undefined) snapshot.streamId = String(entry.ssrc);
    snapshot.packets = add(snapshot.packets, entry.packetsReceived);
    snapshot.packetsLost = add(snapshot.packetsLost, entry.packetsLost);
    snapshot.samples = add(snapshot.samples, entry.totalSamplesReceived);
    snapshot.concealedSamples = add(snapshot.concealedSamples, entry.concealedSamples);
    snapshot.silentConcealedSamples = add(snapshot.silentConcealedSamples, entry.silentConcealedSamples);
    snapshot.jitter = num(entry.jitter) ?? snapshot.jitter;
  }
  return snapshot;
}

/**
 * How a connection reaches the server. `udp` is the normal path. `tcp` delivers lost packets late,
 * as a burst, which is what choppy audio sounds like (GEO-3343). `relay_*` goes through a TURN
 * server, over the protocol it names; plain `relay` is a browser that does not say which.
 */
export type VoiceTransport = 'udp' | 'tcp' | 'relay_udp' | 'relay_tcp' | 'relay_tls' | 'relay';

const RELAY_PROTOCOLS = new Set(['udp', 'tcp', 'tls']);

/** The transport of the candidate pair a report's connection is using, or null before one is chosen. */
export function readTransport(entries: readonly StatsEntry[]): VoiceTransport | null {
  const byId = new Map(entries.map(entry => [entry.id, entry]));
  const selectedPairId = entries.find(entry => entry.type === 'transport')?.selectedCandidatePairId;
  const pairs = entries.filter(entry => entry.type === 'candidate-pair');
  const pair =
    (typeof selectedPairId === 'string' ? byId.get(selectedPairId) : undefined) ??
    // Firefox reports no transport entry: it marks the pair in use `selected`, or failing that
    // only `nominated`, which can also be true of a pair it has moved off.
    pairs.find(entry => entry.selected === true) ??
    pairs.find(entry => entry.nominated === true);
  const local = typeof pair?.localCandidateId === 'string' ? byId.get(pair.localCandidateId) : undefined;
  if (!local) return null;
  if (local.candidateType === 'relay') {
    const protocol = local.relayProtocol;
    return typeof protocol === 'string' && RELAY_PROTOCOLS.has(protocol)
      ? (`relay_${protocol}` as VoiceTransport)
      : 'relay';
  }
  return local.protocol === 'tcp' || local.protocol === 'udp' ? local.protocol : null;
}

export type MicKind = 'built_in' | 'bluetooth' | 'external' | 'virtual' | 'unknown';

/**
 * What kind of microphone a device label describes, so the label itself never leaves the browser.
 * Labels are free text from the OS; these are the patterns browsers report on macOS and Windows. An
 * iPhone used as a Mac's microphone counts as wireless, with Bluetooth. Anything else that is named
 * is `external`.
 */
export function micKindOf(label: string | null | undefined): MicKind {
  const text = (label ?? '').replace(/^(default|communications)\s*-\s*/i, '').trim();
  if (!text) return 'unknown';
  if (/airpods|bluetooth|hands-?free|\bbt\b|beats|bose|jabra|buds|iphone/i.test(text)) return 'bluetooth';
  if (/built-?in|internal|macbook|imac|microphone array|realtek/i.test(text)) return 'built_in';
  if (/blackhole|loopback|virtual|soundflower|krisp|zoomaudio|teams audio|vb-audio|voicemeeter/i.test(text)) {
    return 'virtual';
  }
  return 'external';
}
