/**
 * Pure arithmetic for voice call telemetry (GEO-3340): turns two WebRTC stats snapshots into what a
 * sample reports, and a microphone's label into a kind. No React and no LiveKit, so every rule is
 * testable from plain objects.
 */

/** Cumulative counters for our own microphone. Absent where the browser did not report them. */
export type SenderSnapshot = {
  /** Outbound audio packets. */
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
  packets?: number;
  packetsLost?: number;
  samples?: number;
  /** Samples the browser had to invent because packets came late or never: what choppy sounds like. */
  concealedSamples?: number;
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
 * The growth of a cumulative counter. A counter that went backwards belongs to a new track (a mic
 * switch republishes), so the whole of its current value is new.
 */
function growth(current?: number, previous?: number) {
  if (current === undefined) return null;
  if (previous === undefined || current < previous) return current;
  return current - previous;
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
  const sent = growth(sender.packets, previousSender?.packets);
  const sentLost = growth(sender.packetsLost, previousSender?.packetsLost);
  const energy = growth(sender.energy, previousSender?.energy);
  const micSeconds = growth(sender.samplesDuration, previousSender?.samplesDuration);

  const tracks = [...receivers.entries()];
  const across = (read: (current: ReceiverSnapshot, previous?: ReceiverSnapshot) => number | null) =>
    sum(tracks.map(([id, current]) => read(current, previousReceivers?.get(id))));
  const received = across((current, previous) => growth(current.packets, previous?.packets));
  const receivedLost = across((current, previous) => growth(current.packetsLost, previous?.packetsLost));
  const samples = across((current, previous) => growth(current.samples, previous?.samples));
  const concealed = across((current, previous) => growth(current.concealedSamples, previous?.concealedSamples));
  const jitters = tracks.flatMap(([, current]) => (current.jitter === undefined ? [] : [current.jitter]));

  return {
    sent_packets: sent,
    // Lost against everything we tried to deliver: what arrived plus what did not.
    send_loss_pct: percent(sentLost, sent === null || sentLost === null ? null : sent + sentLost),
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

type StatsEntry = { type?: string; kind?: string; [field: string]: unknown };

const num = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) ? value : undefined);
const add = (total: number | undefined, value: unknown) => {
  const n = num(value);
  return n === undefined ? total : (total ?? 0) + n;
};
const isAudio = (entry: StatsEntry) => entry.kind === undefined || entry.kind === 'audio';

/** Our microphone's sender report: outbound packets, the server's view of them, and the source level. */
export function readSenderReport(entries: Iterable<StatsEntry> | undefined): SenderSnapshot {
  const snapshot: SenderSnapshot = {};
  for (const entry of entries ?? []) {
    if (!isAudio(entry)) continue;
    if (entry.type === 'outbound-rtp') snapshot.packets = add(snapshot.packets, entry.packetsSent);
    else if (entry.type === 'remote-inbound-rtp') {
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
export function readReceiverReport(entries: Iterable<StatsEntry> | undefined): ReceiverSnapshot {
  const snapshot: ReceiverSnapshot = {};
  for (const entry of entries ?? []) {
    if (entry.type !== 'inbound-rtp' || !isAudio(entry)) continue;
    snapshot.packets = add(snapshot.packets, entry.packetsReceived);
    snapshot.packetsLost = add(snapshot.packetsLost, entry.packetsLost);
    snapshot.samples = add(snapshot.samples, entry.totalSamplesReceived);
    snapshot.concealedSamples = add(snapshot.concealedSamples, entry.concealedSamples);
    snapshot.jitter = num(entry.jitter) ?? snapshot.jitter;
  }
  return snapshot;
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
