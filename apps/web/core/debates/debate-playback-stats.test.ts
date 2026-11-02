import { describe, expect, it } from 'vitest';

import {
  type MediaElementLike,
  audioOutputState,
  readVideoReceiverReport,
  recvAudioState,
  recvVideoFps,
  recvVideoState,
} from './debate-playback-stats';

const element = (overrides: Partial<MediaElementLike> = {}): MediaElementLike => ({
  paused: false,
  muted: false,
  isConnected: true,
  sinkId: '',
  videoWidth: 640,
  clientWidth: 320,
  clientHeight: 180,
  ...overrides,
});
const media = (elements: MediaElementLike[], muted = false) => ({ muted, elements });

describe('recvAudioState', () => {
  it('names the first reason the opponent cannot be heard', () => {
    expect(recvAudioState(null, true)).toBe('no_track');
    expect(recvAudioState(media([element({ paused: true })]), false)).toBe('blocked');
    expect(recvAudioState(media([]), true)).toBe('detached');
    expect(recvAudioState(media([element({ paused: true })]), true)).toBe('paused');
    expect(recvAudioState(media([element({ muted: true })]), true)).toBe('muted');
    expect(recvAudioState(media([element()], true), true)).toBe('remote_muted');
    expect(recvAudioState(media([element()]), true)).toBe('playing');
  });

  it('counts an audio element outside the page as playing: it still plays', () => {
    expect(recvAudioState(media([element({ isConnected: false })]), true)).toBe('playing');
  });
});

describe('recvVideoState', () => {
  it('names the first reason the opponent cannot be seen', () => {
    expect(recvVideoState(null)).toBe('no_track');
    expect(recvVideoState(media([element()], true))).toBe('remote_muted');
    expect(recvVideoState(media([]))).toBe('detached');
    expect(recvVideoState(media([element({ isConnected: false })]))).toBe('not_mounted');
    expect(recvVideoState(media([element({ clientWidth: 0, clientHeight: 0 })]))).toBe('hidden');
    expect(recvVideoState(media([element({ paused: true })]))).toBe('paused');
    expect(recvVideoState(media([element({ videoWidth: 0 })]))).toBe('no_frames');
    expect(recvVideoState(media([element()]))).toBe('shown');
  });

  it('calls a picture that decoded nothing since the last sample frozen', () => {
    expect(recvVideoState(media([element()]), 0)).toBe('frozen');
    expect(recvVideoState(media([element()]), 24)).toBe('shown');
  });

  it('is shown when any one of its elements is', () => {
    expect(recvVideoState(media([element({ isConnected: false }), element()]))).toBe('shown');
  });
});

describe('audioOutputState', () => {
  it('reads no choice as the default speaker', () => {
    expect(audioOutputState(null, media([element()]))).toBe('default');
    expect(audioOutputState('default', media([element()]))).toBe('default');
  });

  it('compares the chosen speaker with where the audio actually goes', () => {
    expect(audioOutputState('spk-1', media([element({ sinkId: 'spk-1' })]))).toBe('selected');
    expect(audioOutputState('spk-1', media([element({ sinkId: '' })]))).toBe('mismatch');
  });

  it('reports a chosen speaker the browser no longer lists as missing', () => {
    expect(audioOutputState('spk-1', media([element({ sinkId: 'spk-1' })]), ['default', 'spk-2'])).toBe('missing');
  });

  it('has nothing to compare without an audio element', () => {
    expect(audioOutputState('spk-1', null)).toBeNull();
  });
});

describe('incoming video stats', () => {
  it('reads the inbound camera stream', () => {
    expect(
      readVideoReceiverReport([
        { type: 'inbound-rtp', kind: 'audio', framesDecoded: 1 },
        { type: 'inbound-rtp', kind: 'video', ssrc: 9, framesDecoded: 250, timestamp: 10_000, frameHeight: 360 },
      ])
    ).toEqual({ streamId: '9', framesDecoded: 250, timestamp: 10_000, frameHeight: 360 });
    expect(readVideoReceiverReport([])).toEqual({});
  });

  it('turns decoded frames into a rate, only within one stream', () => {
    const previous = { streamId: '9', framesDecoded: 250, timestamp: 10_000 };
    expect(recvVideoFps({ streamId: '9', framesDecoded: 1_000, timestamp: 40_000 }, previous)).toBe(25);
    expect(recvVideoFps({ streamId: '9', framesDecoded: 250, timestamp: 40_000 }, previous)).toBe(0);
    expect(recvVideoFps({ streamId: '10', framesDecoded: 30, timestamp: 40_000 }, previous)).toBeNull();
    expect(recvVideoFps({ streamId: '9', framesDecoded: 30, timestamp: 40_000 }, undefined)).toBeNull();
  });
});
