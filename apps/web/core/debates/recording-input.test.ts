import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createRecordingInput } from './recording-input';

class TestStream {
  constructor(private tracks: MediaStreamTrack[] = []) {}
  getTracks() {
    return this.tracks;
  }
  getAudioTracks() {
    return this.tracks.filter(track => track.kind === 'audio');
  }
  getVideoTracks() {
    return this.tracks.filter(track => track.kind === 'video');
  }
}

function track(kind: string) {
  return {
    kind,
    readyState: 'live',
    stop: vi.fn(),
    getSettings: () => ({ width: 1280, height: 720, frameRate: 30 }),
  } as unknown as MediaStreamTrack;
}
function source() {
  return new MediaStream([track('audio'), track('video')]);
}

const drawImage = vi.fn();
const audioClose = vi.fn().mockResolvedValue(undefined);
const audioResume = vi.fn().mockResolvedValue(undefined);
let audioSources: { connect: ReturnType<typeof vi.fn>; disconnect: ReturnType<typeof vi.fn> }[];
let video: HTMLVideoElement;
let canvas: HTMLCanvasElement;
let outputAudio: MediaStreamTrack;
let outputVideo: MediaStreamTrack;
const createDestination = vi.fn();

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('MediaStream', TestStream);
  audioSources = [];
  createDestination.mockReset().mockImplementation(() => ({ stream: new MediaStream([outputAudio]) }));
  outputAudio = track('audio');
  outputVideo = track('video');
  vi.stubGlobal(
    'AudioContext',
    class {
      createMediaStreamDestination() {
        return createDestination();
      }
      createMediaStreamSource() {
        const node = { connect: vi.fn(), disconnect: vi.fn() };
        audioSources.push(node);
        return node;
      }
      resume = audioResume;
      close = audioClose;
    }
  );
  const createElement = document.createElement.bind(document);
  canvas = createElement('canvas');
  video = createElement('video');
  Object.defineProperties(video, {
    readyState: { value: HTMLMediaElement.HAVE_CURRENT_DATA },
    videoWidth: { value: 1280 },
    videoHeight: { value: 720 },
  });
  video.play = vi.fn().mockResolvedValue(undefined);
  video.pause = vi.fn();
  Object.assign(canvas, { captureStream: () => new MediaStream([outputVideo]) });
  vi.spyOn(canvas, 'getContext').mockReturnValue({
    fillRect: vi.fn(),
    drawImage,
  } as unknown as CanvasRenderingContext2D);
  vi.spyOn(document, 'createElement').mockImplementation(((tag: string) => {
    if (tag === 'canvas') return canvas;
    if (tag === 'video') return video;
    return createElement(tag);
  }) as typeof document.createElement);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  vi.useRealTimers();
});

describe('stable recording inputs', () => {
  it('retains the recorder tracks while both device sources change', () => {
    const first = source();
    const input = createRecordingInput(first);
    const recorderTracks = input.stream.getTracks();
    const firstAudioSource = audioSources[0];
    const second = source();
    for (const original of first.getTracks()) original.stop();
    input.update(second);
    vi.advanceTimersByTime(100);

    expect(input.stream.getTracks()).toEqual(recorderTracks);
    expect(input.stream.getAudioTracks()).toEqual([outputAudio]);
    expect(input.stream.getVideoTracks()).toEqual([outputVideo]);
    expect(firstAudioSource.disconnect).toHaveBeenCalledOnce();
    expect(audioSources).toHaveLength(2);
    expect((video.srcObject as MediaStream).getVideoTracks()).toEqual(second.getVideoTracks());
    expect(drawImage).toHaveBeenCalled();
    expect(outputAudio.stop).not.toHaveBeenCalled();
    expect(outputVideo.stop).not.toHaveBeenCalled();
    input.stop();
  });

  it('keeps the video element playing across a microphone-only switch', () => {
    const first = source();
    const input = createRecordingInput(first);
    const originalVideo = video.srcObject;
    input.update(new MediaStream([track('audio'), ...first.getVideoTracks()]));
    expect(video.srcObject).toBe(originalVideo);
    expect(video.play).toHaveBeenCalledOnce();
    input.stop();
  });

  it('keeps the audio graph connected across a camera-only switch', () => {
    const first = source();
    const input = createRecordingInput(first);
    input.update(new MediaStream([...first.getAudioTracks(), track('video')]));
    expect(audioSources).toHaveLength(1);
    expect(audioSources[0].disconnect).not.toHaveBeenCalled();
    input.stop();
  });

  it('releases recording resources once without stopping the live call', () => {
    const original = source();
    const input = createRecordingInput(original);
    input.stop();
    input.stop();
    input.update(source());
    expect(outputAudio.stop).toHaveBeenCalledOnce();
    expect(outputVideo.stop).toHaveBeenCalledOnce();
    expect(audioClose).toHaveBeenCalledOnce();
    expect(video.pause).toHaveBeenCalledOnce();
    expect(video.srcObject).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
    for (const callTrack of original.getTracks()) expect(callTrack.stop).not.toHaveBeenCalled();
  });

  it('does not report ready until audio playback has resumed', async () => {
    let resume!: () => void;
    audioResume.mockReturnValueOnce(
      new Promise<void>(resolve => {
        resume = resolve;
      })
    );
    const input = createRecordingInput(source());
    const ready = vi.fn();
    void input.ready.then(ready);
    await Promise.resolve();
    expect(ready).not.toHaveBeenCalled();
    resume();
    await input.ready;
    expect(ready).toHaveBeenCalledOnce();
    input.stop();
  });

  it.each([
    ['startup', 'rejects'],
    ['startup', 'resolves'],
    ['recording', 'rejects'],
    ['recording', 'resolves'],
  ])('waits for replacement playback after a superseded play %s / %s', async (phase, outcome) => {
    let rejectOld!: (error: Error) => void;
    let finishOld!: () => void;
    let finishNew!: () => void;
    const oldPlay = new Promise<void>((resolve, reject) => {
      finishOld = resolve;
      rejectOld = reject;
    });
    const newPlay = new Promise<void>(resolve => {
      finishNew = resolve;
    });
    if (phase === 'startup') vi.mocked(video.play).mockReturnValueOnce(oldPlay);
    const input = createRecordingInput(source());
    if (phase === 'recording') await input.ready;
    if (phase === 'recording') vi.mocked(video.play).mockReturnValueOnce(oldPlay);
    const previous = phase === 'startup' ? input.ready : input.update(source());
    const settled = vi.fn();
    const observed = previous.then(
      () => {
        settled();
        return 'ready';
      },
      error => error
    );
    vi.mocked(video.play).mockReturnValueOnce(newPlay);
    const replacement = input.update(source());
    if (outcome === 'rejects')
      rejectOld(Object.assign(new Error('Playback interrupted by a new source'), { name: 'AbortError' }));
    else finishOld();
    await vi.advanceTimersByTimeAsync(0);
    expect(settled).not.toHaveBeenCalled();
    expect(outputVideo.stop).not.toHaveBeenCalled();
    finishNew();
    await replacement;
    expect(await observed).toBe('ready');
    expect(outputVideo.stop).not.toHaveBeenCalled();
    input.stop();
  });

  it.each(['video', 'audio'])('ignores %s playback failure caused by stopping the input', async kind => {
    let rejectPlayback!: (error: Error) => void;
    const pending = new Promise<void>((_resolve, reject) => {
      rejectPlayback = reject;
    });
    if (kind === 'video') vi.mocked(video.play).mockReturnValueOnce(pending);
    else audioResume.mockReturnValueOnce(pending);
    const input = createRecordingInput(source());
    input.stop();
    rejectPlayback(Object.assign(new Error('Input was stopped'), { name: 'AbortError' }));
    await expect(input.ready).resolves.toBeUndefined();
    expect(audioClose).toHaveBeenCalledOnce();
  });

  it('still rejects a current camera playback failure', async () => {
    vi.mocked(video.play).mockRejectedValueOnce(
      Object.assign(new Error('Camera could not play'), { name: 'AbortError' })
    );
    const input = createRecordingInput(source());
    await expect(input.ready).rejects.toThrow('Camera could not play');
    expect(outputVideo.stop).toHaveBeenCalledOnce();
  });

  it('surfaces playback failure and closes every recording resource', async () => {
    audioResume.mockRejectedValueOnce(new Error('Playback blocked'));
    const input = createRecordingInput(source());
    await expect(input.ready).rejects.toThrow('Playback blocked');
    expect(audioClose).toHaveBeenCalledOnce();
    expect(outputVideo.stop).toHaveBeenCalledOnce();
    expect(outputAudio.stop).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('releases canvas capture if the audio destination cannot be constructed', () => {
    createDestination.mockImplementationOnce(() => {
      throw new Error('Audio setup failed');
    });
    expect(() => createRecordingInput(source())).toThrow('Audio setup failed');
    expect(outputVideo.stop).toHaveBeenCalledOnce();
    expect(audioClose).toHaveBeenCalledOnce();
  });

  it('closes the audio context if canvas capture cannot start', () => {
    Object.assign(canvas, {
      captureStream: () => {
        throw new Error('Unsupported capture');
      },
    });
    expect(() => createRecordingInput(source())).toThrow('Unsupported capture');
    expect(audioClose).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });
});
