import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { GeoChatRequestError } from './api';
import {
  attachStreamSource,
  debateStreamsFully,
  HLS_MAX_BUFFER_SECONDS,
  isStreamUnavailableError,
  previewPairOffsetSeconds,
  recordingHasPreview,
  recordingStreamVariant,
} from './stream-playback';

const hls = vi.hoisted(() => {
  const instances: Array<{
    config: { autoStartLoad?: boolean; maxMaxBufferLength?: number };
    loadSource: ReturnType<typeof vi.fn>;
    attachMedia: ReturnType<typeof vi.fn>;
    startLoad: ReturnType<typeof vi.fn>;
    destroy: ReturnType<typeof vi.fn>;
    handlers: Map<string, (event: string, data: { fatal: boolean }) => void>;
  }> = [];
  class FakeHls {
    static isSupported = vi.fn(() => true);
    static Events = { ERROR: 'hlsError' };
    config: { autoStartLoad?: boolean; maxMaxBufferLength?: number };
    loadSource = vi.fn();
    attachMedia = vi.fn();
    startLoad = vi.fn();
    destroy = vi.fn();
    handlers = new Map<string, (event: string, data: { fatal: boolean }) => void>();
    constructor(config: { autoStartLoad?: boolean; maxMaxBufferLength?: number }) {
      this.config = config;
      instances.push(this);
    }
    on(event: string, handler: (event: string, data: { fatal: boolean }) => void) {
      this.handlers.set(event, handler);
    }
  }
  return { FakeHls, instances };
});

vi.mock('hls.js', () => {
  return { default: hls.FakeHls };
});

const MANIFEST = 'https://videodelivery.test/uid/manifest/video.m3u8';

describe('the flag and per-slot readiness', () => {
  it('asks for nothing with the flag off', () => {
    expect(recordingStreamVariant({ stream_ready: true }, { enabled: false })).toBeUndefined();
    expect(recordingHasPreview({ preview_ready: true }, { enabled: false })).toBe(false);
  });

  it('is off unless NEXT_PUBLIC_DEBATE_STREAM_PLAYBACK is 1', async () => {
    vi.resetModules();
    vi.stubEnv('NEXT_PUBLIC_DEBATE_STREAM_PLAYBACK', '');
    expect((await import('./stream-playback')).DEBATE_STREAM_PLAYBACK_ENABLED).toBe(false);
    vi.resetModules();
    vi.stubEnv('NEXT_PUBLIC_DEBATE_STREAM_PLAYBACK', '1');
    expect((await import('./stream-playback')).DEBATE_STREAM_PLAYBACK_ENABLED).toBe(true);
    vi.unstubAllEnvs();
  });

  it('reads each slot on its own, and an absent field as not ready', () => {
    expect(recordingStreamVariant({ stream_ready: true }, { enabled: true })).toBe('stream');
    expect(recordingStreamVariant({ stream_ready: false }, { enabled: true })).toBeUndefined();
    expect(recordingStreamVariant({}, { enabled: true })).toBeUndefined();
    expect(recordingStreamVariant(null, { enabled: true })).toBeUndefined();
    expect(recordingHasPreview({ preview_ready: true }, { enabled: true })).toBe(true);
    expect(recordingHasPreview({}, { enabled: true })).toBe(false);
  });

  it('streams a debate fully only when both debaters have a Stream copy, with the flag on', () => {
    const ready = (slot: 1 | 2, stream_ready?: boolean) => ({ participant_slot: slot, stream_ready });
    expect(debateStreamsFully([ready(1, true), ready(2, true)], { enabled: true })).toBe(true);
    expect(debateStreamsFully([ready(1, true), ready(2, true)], { enabled: false })).toBe(false);
    // The one-sided debate: slot 1 is a raw local.mp4 that never reached Stream.
    expect(debateStreamsFully([ready(1, false), ready(2, true)], { enabled: true })).toBe(false);
    expect(debateStreamsFully([ready(2, true)], { enabled: true })).toBe(false);
    expect(debateStreamsFully([ready(1, true), ready(2)], { enabled: true })).toBe(false);
    expect(debateStreamsFully(undefined, { enabled: true })).toBe(false);
  });

  it('names the refusals that mean the variant is unavailable', () => {
    expect(isStreamUnavailableError(new GeoChatRequestError('x', 'stream_not_configured', 503))).toBe(true);
    expect(isStreamUnavailableError(new GeoChatRequestError('x', 'recording_variant_not_found', 404))).toBe(true);
    expect(isStreamUnavailableError(new GeoChatRequestError('x', 'recording_not_found', 404))).toBe(false);
    expect(isStreamUnavailableError(new Error('network'))).toBe(false);
  });
});

describe('aligning the two preview clips', () => {
  it('offsets slot 2 by the gap between the clips’ starts on the wall clock', () => {
    // Slot 1's recording started 300ms later; both clips are cut at 10s of their own recording.
    expect(
      previewPairOffsetSeconds(
        { started_at_ms: 1_000_300, preview_start_seconds: 10 },
        { started_at_ms: 1_000_000, preview_start_seconds: 10 }
      )
    ).toBeCloseTo(0.3);
    // Whole-second cuts that differ are part of the same arithmetic.
    expect(
      previewPairOffsetSeconds(
        { started_at_ms: 1_000_000, preview_start_seconds: 10 },
        { started_at_ms: 1_000_400, preview_start_seconds: 9 }
      )
    ).toBeCloseTo(0.6);
  });

  it('leaves the pair unaligned when either start is unknown', () => {
    expect(previewPairOffsetSeconds({ started_at_ms: 1_000_000, preview_start_seconds: 10 }, null)).toBe(0);
  });
});

describe('attaching a Stream source', () => {
  beforeEach(() => {
    hls.instances.length = 0;
    hls.FakeHls.isSupported.mockReturnValue(true);
  });

  it('gives native HLS the manifest as src and never fetches hls.js', async () => {
    const load = vi.fn(() => import('hls.js'));
    const video = document.createElement('video');

    attachStreamSource(video, MANIFEST, { nativeHls: true, load });
    await Promise.resolve();

    expect(video.getAttribute('src')).toBe(MANIFEST);
    expect(load).not.toHaveBeenCalled();
    expect(hls.instances).toHaveLength(0);
  });

  it('imports hls.js only when attaching elsewhere, and hands it the manifest', async () => {
    const load = vi.fn(() => import('hls.js'));
    const video = document.createElement('video');

    attachStreamSource(video, MANIFEST, { nativeHls: false, load });
    await vi.waitFor(() => expect(hls.instances).toHaveLength(1));

    expect(load).toHaveBeenCalledTimes(1);
    expect(video.getAttribute('src')).toBeNull();
    expect(hls.instances[0].loadSource).toHaveBeenCalledWith(MANIFEST);
    expect(hls.instances[0].attachMedia).toHaveBeenCalledWith(video);
  });

  it('holds segment fetches until play when asked not to start, like preload="metadata"', async () => {
    const video = document.createElement('video');
    attachStreamSource(video, MANIFEST, { nativeHls: false, autoStartLoad: false });
    await vi.waitFor(() => expect(hls.instances).toHaveLength(1));

    expect(hls.instances[0].config.autoStartLoad).toBe(false);
    video.dispatchEvent(new Event('play'));
    expect(hls.instances[0].startLoad).toHaveBeenCalledTimes(1);
  });

  it('caps the buffer at 30 seconds, where hls.js would otherwise fill 60 MB per element', async () => {
    const video = document.createElement('video');
    attachStreamSource(video, MANIFEST, { nativeHls: false });
    await vi.waitFor(() => expect(hls.instances).toHaveLength(1));

    expect(hls.instances[0].config.maxMaxBufferLength).toBe(HLS_MAX_BUFFER_SECONDS);
    expect(HLS_MAX_BUFFER_SECONDS).toBe(30);
  });

  it('reports a fatal hls.js error once, and destroys the instance when released', async () => {
    const onFatalError = vi.fn();
    const video = document.createElement('video');
    const attached = attachStreamSource(video, MANIFEST, { nativeHls: false, onFatalError });
    await vi.waitFor(() => expect(hls.instances).toHaveLength(1));

    hls.instances[0].handlers.get('hlsError')?.('hlsError', { fatal: false });
    expect(onFatalError).not.toHaveBeenCalled();
    hls.instances[0].handlers.get('hlsError')?.('hlsError', { fatal: true });
    expect(onFatalError).toHaveBeenCalledTimes(1);

    attached.destroy();
    expect(hls.instances[0].destroy).toHaveBeenCalledTimes(1);
  });

  it('does nothing if released before hls.js arrives', async () => {
    let resolve: (module: typeof import('hls.js')) => void = () => {};
    const load = () => new Promise<typeof import('hls.js')>(r => (resolve = r));
    const video = document.createElement('video');
    const attached = attachStreamSource(video, MANIFEST, { nativeHls: false, load });

    attached.destroy();
    resolve((await import('hls.js')) as typeof import('hls.js'));
    await Promise.resolve();

    expect(hls.instances).toHaveLength(0);
  });

  it('falls back to the manifest as src where there is no Media Source', async () => {
    hls.FakeHls.isSupported.mockReturnValue(false);
    const video = document.createElement('video');
    attachStreamSource(video, MANIFEST, { nativeHls: false });
    await vi.waitFor(() => expect(video.getAttribute('src')).toBe(MANIFEST));
    expect(hls.instances).toHaveLength(0);
  });
});

/**
 * hls.js must stay out of the feed and page bundles: it is only ever reached through the dynamic
 * `import('hls.js')` in `loadHls`. A static import anywhere would put it in whichever chunk that
 * file lands in. The build output is checked as well (see the PR), but this holds the line in CI.
 */
describe('hls.js is only imported lazily', () => {
  const root = path.resolve(__dirname, '..', '..');
  const sourceFiles = (dir: string): string[] =>
    readdirSync(dir).flatMap(entry => {
      if (entry === 'node_modules' || entry === '.next' || entry.startsWith('.')) return [];
      const full = path.join(dir, entry);
      if (statSync(full).isDirectory()) return sourceFiles(full);
      return /\.(ts|tsx)$/.test(entry) && !/\.test\.tsx?$/.test(entry) ? [full] : [];
    });

  it('has no static import of hls.js in the app', () => {
    const offenders = ['app', 'core', 'partials', 'design-system']
      .map(dir => path.join(root, dir))
      .flatMap(dir => {
        try {
          return sourceFiles(dir);
        } catch {
          return [];
        }
      })
      .filter(file => /^\s*import\s[^(]*from\s+['"]hls\.js['"]/m.test(readFileSync(file, 'utf8')));
    expect(offenders).toEqual([]);
  });
});
