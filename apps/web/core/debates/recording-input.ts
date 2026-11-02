/**
 * MediaRecorder cannot follow LiveKit's replaceTrack, and adding/removing tracks on its stream
 * stops the recorder. Give it one canvas track and one Web Audio destination for its lifetime.
 * Only their sources change when capture moves to another device (or Krisp restarts).
 */
export type RecordingInput = {
  stream: MediaStream;
  ready: Promise<void>;
  update: (source: MediaStream) => Promise<void>;
  stop: () => void;
};

export function createRecordingInput(source: MediaStream): RecordingInput {
  const canvas = document.createElement('canvas');
  const video = document.createElement('video');
  video.muted = true;
  video.playsInline = true;
  const settings = source.getVideoTracks()[0]?.getSettings();
  canvas.width = settings?.width || 1280;
  canvas.height = settings?.height || 720;
  const context = canvas.getContext('2d', { alpha: false });
  if (!context) throw new Error('Could not create the recording canvas.');
  const audio = new AudioContext();
  let canvasStream: MediaStream;
  try {
    canvasStream = canvas.captureStream(settings?.frameRate || 30);
  } catch (error) {
    void audio.close().catch(() => undefined);
    throw error;
  }
  const ownedTracks = canvasStream.getTracks();
  let destination: MediaStreamAudioDestinationNode;
  let stream: MediaStream;
  try {
    destination = audio.createMediaStreamDestination();
    ownedTracks.push(...destination.stream.getAudioTracks());
    stream = new MediaStream(ownedTracks);
  } catch (error) {
    for (const track of ownedTracks) track.stop();
    void audio.close().catch(() => undefined);
    throw error;
  }
  let audioSource: MediaStreamAudioSourceNode | null = null;
  let audioTrack: MediaStreamTrack | undefined;
  let videoTrack: MediaStreamTrack | undefined;
  let stopped = false;
  let playback: Promise<void> = Promise.resolve();
  const waitForPlayback = async () => {
    // Replacing srcObject can abort an earlier play(). Only the current source's failure is fatal,
    // and every waiter (including startup's ready) must follow replacements until one settles.
    while (!stopped) {
      const pending = playback;
      try {
        await pending;
      } catch (error) {
        if (!stopped && pending === playback) throw error;
      }
      if (pending === playback) return;
    }
  };
  const update = async (source: MediaStream) => {
    if (stopped) return;
    const nextAudio = source.getAudioTracks()[0];
    const nextVideo = source.getVideoTracks()[0];
    if (nextAudio !== audioTrack) {
      const nextSource = nextAudio ? audio.createMediaStreamSource(new MediaStream([nextAudio])) : null;
      nextSource?.connect(destination);
      audioSource?.disconnect();
      audioSource = nextSource;
      audioTrack = nextAudio;
    }
    if (nextVideo !== videoTrack) {
      video.srcObject = nextVideo ? new MediaStream([nextVideo]) : null;
      playback = nextVideo ? video.play() : Promise.resolve();
      videoTrack = nextVideo;
    }
    await Promise.all([
      waitForPlayback(),
      audio.resume().catch(error => {
        if (!stopped) throw error;
      }),
    ]);
  };
  const draw = () => {
    // Black during a camera interruption, rather than repeating the last frame indefinitely.
    context.fillStyle = '#000';
    context.fillRect(0, 0, canvas.width, canvas.height);
    if (
      videoTrack?.readyState === 'live' &&
      video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA &&
      video.videoWidth > 0 &&
      video.videoHeight > 0
    ) {
      const ratio = Math.min(canvas.width / video.videoWidth, canvas.height / video.videoHeight);
      const width = video.videoWidth * ratio;
      const height = video.videoHeight * ratio;
      context.drawImage(video, (canvas.width - width) / 2, (canvas.height - height) / 2, width, height);
    }
  };
  const timer = window.setInterval(draw, 1000 / (settings?.frameRate || 30));
  const stop = () => {
    if (stopped) return;
    stopped = true;
    window.clearInterval(timer);
    video.pause();
    video.srcObject = null;
    audioSource?.disconnect();
    for (const track of ownedTracks) track.stop();
    void audio.close().catch(() => undefined);
  };
  const ready = update(source)
    .then(() => {
      if (!stopped) draw();
    })
    .catch(error => {
      stop();
      throw error;
    });
  return { stream, ready, update, stop };
}
