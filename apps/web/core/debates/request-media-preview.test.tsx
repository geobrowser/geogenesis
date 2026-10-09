import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

import * as React from 'react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DebateRequestMediaPreview } from './request-media-preview';

const mocks = vi.hoisted(() => ({
  /** What `permissions.query` answers for camera and microphone. */
  permission: 'prompt' as PermissionState | 'throw' | 'absent',
  /** Overrides for `permission`, one device at a time. */
  cameraPermission: null as PermissionState | null,
  micPermission: null as PermissionState | null,
  ensurePreview: vi.fn(),
  beginSession: vi.fn(),
  releaseSession: vi.fn(),
  stopMedia: vi.fn(),
  previewState: 'idle' as string,
  previewError: null as string | null,
  /** What `ensurePreview` hands back — the per-device truth the card reads. */
  tracks: [] as { mediaStreamTrack: { kind: string } }[],
}));

/*
 * Only the hook is replaced. The rest of the module comes through as it really is — the failure
 * copy in particular, so this file asserts the words the app actually says rather than a second
 * copy of them that can drift.
 */
vi.mock('./media-session', async importOriginal => ({
  ...(await importOriginal<typeof import('./media-session')>()),
  useOptionalDebateMediaSession: () => ({
    previewState: mocks.previewState,
    previewError: mocks.previewError,
    previewStream: null,
    localTracksRef: { current: mocks.tracks },
    ensurePreview: mocks.ensurePreview,
    beginSession: mocks.beginSession,
    releaseSession: mocks.releaseSession,
    stopMedia: mocks.stopMedia,
  }),
}));

vi.mock('./debate-video-tile', () => ({
  DebateVideoTile: ({ children, tileControls }: { children: React.ReactNode; tileControls: React.ReactNode }) => (
    <div data-testid="tile">
      {tileControls}
      {children}
    </div>
  ),
}));

vi.mock('~/design-system/avatar', () => ({ Avatar: () => <div data-testid="avatar" /> }));

beforeEach(() => {
  mocks.permission = 'prompt';
  mocks.cameraPermission = null;
  mocks.micPermission = null;
  mocks.previewState = 'idle';
  mocks.previewError = null;
  mocks.tracks = [{ mediaStreamTrack: { kind: 'audio' } }, { mediaStreamTrack: { kind: 'video' } }];
  mocks.ensurePreview.mockReset().mockImplementation(async (options: { audio?: boolean; video?: boolean } = {}) => {
    const wantAudio = options.audio ?? true;
    const wantVideo = options.video ?? true;
    const got = mocks.tracks.filter(
      t => (t.mediaStreamTrack.kind === 'audio' && wantAudio) || (t.mediaStreamTrack.kind === 'video' && wantVideo)
    );
    // Mirrors the real function: a kind that was asked for and is not there is a NotFoundError, not
    // a short array. An earlier mock returned the short array and made the card's handling of a
    // missing camera look covered when it was dead code.
    if (
      (wantAudio && !got.some(t => t.mediaStreamTrack.kind === 'audio')) ||
      (wantVideo && !got.some(t => t.mediaStreamTrack.kind === 'video'))
    ) {
      throw Object.assign(new Error('Required media tracks are unavailable.'), { name: 'NotFoundError' });
    }
    return got;
  });
  mocks.beginSession.mockReset();
  mocks.releaseSession.mockReset();
  mocks.stopMedia.mockReset();
});

afterEach(cleanup);

function mount() {
  // Installed here rather than in `beforeEach`, which runs before a case has chosen its answer.
  Object.defineProperty(navigator, 'permissions', {
    configurable: true,
    value:
      mocks.permission === 'absent'
        ? undefined
        : {
            query: vi.fn(async ({ name }: { name: string }) => {
              if (mocks.permission === 'throw') throw new Error('nope');
              const answer = name === 'camera' ? mocks.cameraPermission : mocks.micPermission;
              return { state: (answer ?? mocks.permission) as PermissionState };
            }),
          },
  });
  return render(<DebateRequestMediaPreview sessionKey="debate:debate-1" />);
}

describe('DebateRequestMediaPreview', () => {
  /*
   * The criterion in two halves: open the camera on arrival where the browser already allows it,
   * and do not prompt otherwise. The second half is the one that matters — a permission prompt
   * nobody asked for is the one that gets denied by reflex and then has to be undone in settings.
   */
  it('starts the preview on open when the browser already allows it', async () => {
    mocks.permission = 'granted';
    mount();

    await waitFor(() => expect(mocks.ensurePreview).toHaveBeenCalled());
    expect(await screen.findByText('Joining with mic and camera on')).toBeInTheDocument();
  });

  it('does not touch the camera when permission has never been asked', async () => {
    mocks.permission = 'prompt';
    mount();

    await screen.findByText('Joining listening only');
    expect(mocks.ensurePreview).not.toHaveBeenCalled();
  });

  // Safari has not historically answered `permissions.query` for camera and mic. Silence is not
  // consent, so it waits like any other unknown.
  it('waits when the browser cannot answer the permission question', async () => {
    mocks.permission = 'throw';
    mount();

    await screen.findByText('Joining listening only');
    expect(mocks.ensurePreview).not.toHaveBeenCalled();
  });

  it('prompts only once the person asks for a device', async () => {
    mocks.permission = 'prompt';
    mount();
    await screen.findByText('Joining listening only');

    fireEvent.click(screen.getByRole('button', { name: 'Turn microphone on' }));

    await waitFor(() => expect(mocks.ensurePreview).toHaveBeenCalledTimes(1));
    expect(await screen.findByText('Joining with mic on, camera off')).toBeInTheDocument();
  });

  /*
   * Dismissal has to *stop* the tracks, not mute them: the browser's recording indicator only goes
   * away when the tracks end, and a card nobody is looking at must not leave the camera light on.
   */
  it('releases the session when the card goes away', async () => {
    mocks.permission = 'granted';
    const view = mount();
    await waitFor(() => expect(mocks.ensurePreview).toHaveBeenCalled());

    view.unmount();

    expect(mocks.releaseSession).toHaveBeenCalledWith('debate:debate-1');
  });

  it('explains how to unblock, and offers no toggles, when the browser has refused', async () => {
    mocks.permission = 'denied';
    mount();

    expect(await screen.findByText(/blocked for this site/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /microphone/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /camera/i })).toBeNull();
    expect(screen.getByText('Joining listening only')).toBeInTheDocument();
  });

  it('leaves exactly the chosen devices open for the room to inherit', async () => {
    mocks.permission = 'granted';
    mount();
    await screen.findByText('Joining with mic and camera on');

    fireEvent.click(screen.getByRole('button', { name: 'Turn camera off' }));

    await waitFor(() =>
      expect(mocks.ensurePreview).toHaveBeenLastCalledWith(expect.objectContaining({ audio: true, video: false }))
    );
    expect(await screen.findByText('Joining with mic on, camera off')).toBeInTheDocument();
    expect(screen.queryByText('Joining with mic and camera on')).toBeNull();
  });
});

describe('one device refused and the other allowed', () => {
  it('keeps the microphone switch when only the camera was refused', async () => {
    mocks.cameraPermission = 'denied';
    mocks.micPermission = 'granted';
    mount();

    expect(await screen.findByText(/^Camera is blocked for this site/)).toBeInTheDocument();
    expect(screen.queryByText(/Camera and mic are blocked/)).toBeNull();
    expect(screen.queryByRole('button', { name: /camera/i })).toBeNull();
    expect(screen.getByRole('button', { name: /microphone/i })).toBeInTheDocument();
    // And the device that is allowed is opened, without prompting for the one that is not.
    await waitFor(() =>
      expect(mocks.ensurePreview).toHaveBeenLastCalledWith(expect.objectContaining({ audio: true, video: false }))
    );
    expect(await screen.findByText('Joining with mic on, camera off')).toBeInTheDocument();
  });

  it('keeps the camera switch when only the microphone was refused', async () => {
    mocks.cameraPermission = 'granted';
    mocks.micPermission = 'denied';
    mount();

    expect(await screen.findByText(/^Mic is blocked for this site/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /microphone/i })).toBeNull();
    expect(screen.getByRole('button', { name: /camera/i })).toBeInTheDocument();
    await waitFor(() =>
      expect(mocks.ensurePreview).toHaveBeenLastCalledWith(expect.objectContaining({ audio: false, video: true }))
    );
  });

  // Both refused is the one case where there is nothing left to choose.
  it('offers nothing when both were refused', async () => {
    mocks.cameraPermission = 'denied';
    mocks.micPermission = 'denied';
    mount();

    expect(await screen.findByText(/Camera and mic are blocked/)).toBeInTheDocument();
    expect(screen.queryAllByRole('button')).toHaveLength(0);
    expect(screen.getByText('Joining listening only')).toBeInTheDocument();
  });
});

describe('a device failing for a reason that names no device', () => {
  function inUseError() {
    return Object.assign(new Error('Could not start video source'), { name: 'NotReadableError' });
  }

  const IN_USE_COPY = 'Your camera or microphone may be in use by another app. Close it and try again.';

  function cameraHeldElsewhere() {
    mocks.ensurePreview.mockReset().mockImplementation(async (options: { audio?: boolean; video?: boolean } = {}) => {
      if (options.video) throw inUseError();
      return mocks.tracks.filter(track => track.mediaStreamTrack.kind === 'audio');
    });
  }

  it('keeps the microphone that was already working', async () => {
    mocks.permission = 'prompt';
    cameraHeldElsewhere();
    mount();
    await screen.findByText('Joining listening only');

    fireEvent.click(screen.getByRole('button', { name: 'Turn microphone on' }));
    await screen.findByText('Joining with mic on, camera off');

    fireEvent.click(screen.getByRole('button', { name: 'Turn camera on' }));

    expect(await screen.findByText(IN_USE_COPY)).toBeInTheDocument();
    // Still able to speak, and the card still says so.
    expect(await screen.findByRole('button', { name: 'Turn microphone off' })).toBeInTheDocument();
    expect(await screen.findByText('Joining with mic on, camera off')).toBeInTheDocument();
  });

  it('keeps saying why the camera did not come on', async () => {
    mocks.permission = 'prompt';
    cameraHeldElsewhere();
    mount();
    await screen.findByText('Joining listening only');
    fireEvent.click(screen.getByRole('button', { name: 'Turn microphone on' }));
    await screen.findByText('Joining with mic on, camera off');

    fireEvent.click(screen.getByRole('button', { name: 'Turn camera on' }));
    await screen.findByText(IN_USE_COPY);

    // The microphone is back by now — the notice must not have gone with the attempt that failed.
    await screen.findByRole('button', { name: 'Turn microphone off' });
    expect(screen.getByText(IN_USE_COPY)).toBeInTheDocument();
  });

  it('settles on nothing when nothing was working', async () => {
    mocks.permission = 'prompt';
    mocks.ensurePreview.mockReset().mockRejectedValue(inUseError());
    mount();
    await screen.findByText('Joining listening only');

    fireEvent.click(screen.getByRole('button', { name: 'Turn camera on' }));

    expect(await screen.findByText(IN_USE_COPY)).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: 'Turn camera on' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Turn microphone on' })).toBeInTheDocument();
  });

  it('does not reopen a microphone that was deliberately turned off', async () => {
    mocks.permission = 'granted';
    mount();
    await screen.findByText('Joining with mic and camera on');

    fireEvent.click(screen.getByRole('button', { name: 'Turn camera off' }));
    await screen.findByText('Joining with mic on, camera off');
    fireEvent.click(screen.getByRole('button', { name: 'Turn microphone off' }));
    await screen.findByText('Joining listening only');

    cameraHeldElsewhere();
    fireEvent.click(screen.getByRole('button', { name: 'Turn camera on' }));

    expect(await screen.findByText(IN_USE_COPY)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Turn microphone on' })).toBeInTheDocument();
    expect(await screen.findByText('Joining listening only')).toBeInTheDocument();
  });

  it('gives up altogether, and says so, when the retreat fails too', async () => {
    mocks.permission = 'prompt';
    cameraHeldElsewhere();
    mount();
    await screen.findByText('Joining listening only');
    fireEvent.click(screen.getByRole('button', { name: 'Turn microphone on' }));
    await screen.findByText('Joining with mic on, camera off');

    // Now the microphone goes too, so the fallback is no better than the attempt.
    mocks.ensurePreview.mockReset().mockRejectedValue(inUseError());
    fireEvent.click(screen.getByRole('button', { name: 'Turn camera on' }));

    expect(await screen.findByRole('button', { name: 'Turn microphone on' })).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: 'Turn camera on' })).toBeInTheDocument();
    expect(await screen.findByText('Joining listening only')).toBeInTheDocument();
  });

  it('names only the device that is actually absent, and keeps naming it', async () => {
    mocks.permission = 'prompt';
    mocks.tracks = [{ mediaStreamTrack: { kind: 'audio' } }];
    mount();
    await screen.findByText('Joining listening only');

    fireEvent.click(screen.getByRole('button', { name: 'Turn microphone on' }));
    await screen.findByText('Joining with mic on, camera off');

    fireEvent.click(screen.getByRole('button', { name: 'Turn camera on' }));

    expect(await screen.findByText('No camera found.')).toBeInTheDocument();
    expect(screen.queryByText('No camera or microphone found.')).toBeNull();
    // The microphone that was working is still working.
    expect(await screen.findByRole('button', { name: 'Turn microphone off' })).toBeInTheDocument();
    expect(await screen.findByText('Joining with mic on, camera off')).toBeInTheDocument();
  });
});

describe('handing the devices on', () => {
  it('keeps the devices alive when the card is handing them on', async () => {
    mocks.permission = 'granted';
    const retain = { current: false };
    const view = render(<DebateRequestMediaPreview sessionKey="debate:debate-1" retain={retain} />);
    await waitFor(() => expect(mocks.ensurePreview).toHaveBeenCalled());

    // What an accept handler does before navigating.
    retain.current = true;
    view.unmount();

    expect(mocks.releaseSession).not.toHaveBeenCalled();
  });

  it('still stops them on a dismissal', async () => {
    mocks.permission = 'granted';
    const retain = { current: false };
    const view = render(<DebateRequestMediaPreview sessionKey="debate:debate-1" retain={retain} />);
    await waitFor(() => expect(mocks.ensurePreview).toHaveBeenCalled());

    view.unmount();

    expect(mocks.releaseSession).toHaveBeenCalledWith('debate:debate-1');
  });
});

describe('a device that is not there', () => {
  it('does not claim a camera the machine does not have', async () => {
    mocks.permission = 'prompt';
    mocks.tracks = [{ mediaStreamTrack: { kind: 'audio' } }];
    mount();
    await screen.findByText('Joining listening only');

    fireEvent.click(screen.getByRole('button', { name: 'Turn camera on' }));

    expect(await screen.findByText(/No camera found/i)).toBeInTheDocument();

    expect(screen.getByText('Joining listening only')).toBeInTheDocument();
    expect(screen.queryByText('Joining muted')).toBeNull();
    expect(screen.queryByText('Joining with mic and camera on')).toBeNull();
  });

  it('does not claim a microphone the machine does not have', async () => {
    mocks.permission = 'prompt';
    mocks.tracks = [{ mediaStreamTrack: { kind: 'video' } }];
    mount();
    await screen.findByText('Joining listening only');

    fireEvent.click(screen.getByRole('button', { name: 'Turn microphone on' }));

    expect(await screen.findByText(/No microphone found/i)).toBeInTheDocument();
    expect(screen.getByText('Joining listening only')).toBeInTheDocument();
    expect(screen.queryByText('Joining with mic on, camera off')).toBeNull();
  });

  it('says no camera rather than offering the unblock instructions', async () => {
    mocks.permission = 'prompt';
    mocks.tracks = [{ mediaStreamTrack: { kind: 'audio' } }];
    mount();
    await screen.findByText('Joining listening only');

    fireEvent.click(screen.getByRole('button', { name: 'Turn camera on' }));

    await screen.findByText(/No camera found/i);
    expect(screen.queryByText(/blocked for this site/i)).toBeNull();
  });

  it('lets the mic go on while the camera is absent', async () => {
    mocks.permission = 'prompt';
    mocks.tracks = [{ mediaStreamTrack: { kind: 'audio' } }];
    mount();
    await screen.findByText('Joining listening only');

    fireEvent.click(screen.getByRole('button', { name: 'Turn microphone on' }));

    expect(await screen.findByText('Joining with mic on, camera off')).toBeInTheDocument();
  });

  it('surfaces an unexpected media failure rather than promising devices', async () => {
    mocks.permission = 'granted';
    mocks.ensurePreview.mockRejectedValue(new Error('0x80070005 ERR_DEVICE_INIT'));
    mount();

    expect(
      await screen.findByText('We could not start your camera and microphone. Check your devices and try again.')
    ).toBeInTheDocument();
    expect(screen.queryByText(/0x80070005/)).toBeNull();
    expect(await screen.findByText('Joining listening only')).toBeInTheDocument();
  });

  it('routes a refusal to the blocked copy rather than a bare failure line', async () => {
    mocks.permission = 'prompt';
    mocks.ensurePreview
      .mockReset()
      .mockRejectedValue(Object.assign(new Error('Permission denied'), { name: 'NotAllowedError' }));
    mount();
    await screen.findByText('Joining listening only');
    mocks.permission = 'denied';

    fireEvent.click(screen.getByRole('button', { name: 'Turn camera on' }));

    expect(await screen.findByText(/blocked for this site/i)).toBeInTheDocument();
    expect(screen.queryByText('Permission denied')).toBeNull();

    expect(screen.queryByRole('button', { name: /microphone/i })).toBeNull();
    expect(screen.getByText('Joining listening only')).toBeInTheDocument();
  });

  it('keeps the toggles when the prompt was dismissed rather than refused', async () => {
    mocks.permission = 'prompt';
    mocks.ensurePreview
      .mockReset()
      .mockRejectedValue(Object.assign(new Error('Permission dismissed'), { name: 'NotAllowedError' }));
    mount();
    await screen.findByText('Joining listening only');

    fireEvent.click(screen.getByRole('button', { name: 'Turn camera on' }));

    expect(await screen.findByText('Allow access to your camera and microphone to continue.')).toBeInTheDocument();
    expect(screen.queryByText(/blocked for this site/i)).toBeNull();
    expect(screen.getByRole('button', { name: 'Turn camera on' })).toBeInTheDocument();
  });
});

/**
 * The defect this suite missed for two rounds: the toggles flipped labels while the devices were
 * untouched. `ensurePreview` acquired both kinds, always live.
 */
describe('the devices match the sentence', () => {
  it('opens nothing at all for listening only', async () => {
    mocks.permission = 'prompt';
    mount();

    await screen.findByText('Joining listening only');
    expect(mocks.ensurePreview).not.toHaveBeenCalled();
  });

  it('opens the microphone alone when only the mic is on', async () => {
    mocks.permission = 'prompt';
    mount();
    await screen.findByText('Joining listening only');

    fireEvent.click(screen.getByRole('button', { name: 'Turn microphone on' }));

    await waitFor(() => expect(mocks.ensurePreview).toHaveBeenCalled());
    expect(mocks.ensurePreview).toHaveBeenLastCalledWith(expect.objectContaining({ audio: true, video: false }));
  });

  it('opens the camera alone when only the camera is on', async () => {
    mocks.permission = 'prompt';
    mount();
    await screen.findByText('Joining listening only');

    fireEvent.click(screen.getByRole('button', { name: 'Turn camera on' }));

    await waitFor(() => expect(mocks.ensurePreview).toHaveBeenCalled());
    expect(mocks.ensurePreview).toHaveBeenLastCalledWith(expect.objectContaining({ audio: false, video: true }));
  });

  it('opens both when both are on', async () => {
    mocks.permission = 'granted';
    mount();

    await waitFor(() => expect(mocks.ensurePreview).toHaveBeenCalled());
    expect(mocks.ensurePreview).toHaveBeenLastCalledWith(expect.objectContaining({ audio: true, video: true }));
  });

  it('closes the devices when everything is turned off', async () => {
    mocks.permission = 'granted';
    mount();
    await screen.findByText('Joining with mic and camera on');

    fireEvent.click(screen.getByRole('button', { name: 'Turn camera off' }));
    fireEvent.click(screen.getByRole('button', { name: 'Turn microphone off' }));

    await waitFor(() => expect(mocks.stopMedia).toHaveBeenCalled());
    expect(await screen.findByText('Joining listening only')).toBeInTheDocument();
  });
});
