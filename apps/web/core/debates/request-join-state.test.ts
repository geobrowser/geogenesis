import { describe, expect, it } from 'vitest';

import {
  type DebateMediaPermission,
  describeFormatLine,
  describeJoinState,
  formatTotalSpeakingTime,
  inheritedJoinState,
  isMediaBlocked,
  joinStateNeedsOpening,
  kindsForJoinState,
  mayAutoStartPreview,
} from './request-join-state';

describe('describeJoinState', () => {
  it('names the three states the card promises', () => {
    expect(describeJoinState({ micOn: true, cameraOn: true }).summary).toBe('Joining with mic and camera on');
    expect(describeJoinState({ micOn: false, cameraOn: true }).summary).toBe('Joining muted');
    expect(describeJoinState({ micOn: false, cameraOn: false }).summary).toBe('Joining listening only');
  });

  it('describes a live mic with the camera off rather than mislabelling it', () => {
    const { summary } = describeJoinState({ micOn: true, cameraOn: false });

    expect(summary).toBe('Joining with mic on, camera off');
    expect(summary).not.toBe(describeJoinState({ micOn: false, cameraOn: false }).summary);
  });

  it('gives every state a spoken form as well as a label', () => {
    for (const micOn of [true, false]) {
      for (const cameraOn of [true, false]) {
        const { announcement } = describeJoinState({ micOn, cameraOn });
        expect(announcement.endsWith('.')).toBe(true);
      }
    }
  });
});

describe('mayAutoStartPreview', () => {
  /*
   * The whole of the "no prompt until they ask" criterion lives here. Only a browser that has
   * already said yes may be opened on arrival; every other answer waits for a press, including the
   * answer that is no answer at all.
   */
  it('opens the camera on arrival only where permission already exists', () => {
    expect(mayAutoStartPreview('granted')).toBe(true);
  });

  it.each<DebateMediaPermission>(['prompt', 'denied', 'unsupported'])('waits for a press when %s', permission => {
    expect(mayAutoStartPreview(permission)).toBe(false);
  });

  /*
   * `unsupported` is the one worth stating on its own. Safari has not historically answered
   * `permissions.query` for camera and microphone, and reading that silence as "probably granted"
   * is exactly how an unasked-for prompt ships — the prompt people deny by reflex and then have to
   * undo in browser settings.
   */
  it('treats an unanswerable permission as a reason to wait, not to try', () => {
    expect(mayAutoStartPreview('unsupported')).toBe(false);
  });
});

describe('isMediaBlocked', () => {
  it('asks for an explanation only when the browser has refused', () => {
    expect(isMediaBlocked('denied')).toBe(true);
    expect(isMediaBlocked('prompt')).toBe(false);
    expect(isMediaBlocked('granted')).toBe(false);
    // Not knowing is not the same as being refused: offering "here is how to unblock" to somebody
    // who has never been asked explains a problem they do not have.
    expect(isMediaBlocked('unsupported')).toBe(false);
  });
});

/*
 * What the room starts with. "No tracks" says two different things — a card that chose to join
 * listening only holds none, and neither does a room reached without a card at all — and reading
 * them as one made the choice to stay quiet arrive unmuted with the camera on.
 */
describe('inheritedJoinState', () => {
  it('starts muted and dark when a card handed over nothing', () => {
    expect(inheritedJoinState([], true)).toEqual({ audioMuted: true, videoEnabled: false });
  });

  it('keeps the room defaults when no card preceded it', () => {
    expect(inheritedJoinState([], false)).toEqual({ audioMuted: false, videoEnabled: true });
  });

  it('follows the devices a card did hand over', () => {
    expect(inheritedJoinState(['audio'], true)).toEqual({ audioMuted: false, videoEnabled: false });
    expect(inheritedJoinState(['audio', 'video'], true)).toEqual({ audioMuted: false, videoEnabled: true });
    expect(inheritedJoinState(['video'], true)).toEqual({ audioMuted: true, videoEnabled: true });
  });
});

describe('describeFormatLine', () => {
  it('names the format and the total speaking time', () => {
    expect(
      describeFormatLine({
        label: '1/1 45/45 30/30',
        turnDurationsMs: [60_000, 60_000, 45_000, 45_000, 30_000, 30_000],
      })
    ).toBe('1/1 45/45 30/30 · 4 min 30s total');
  });

  // The time is an upper bound rather than a figure the debate is promised to reach.
  it('states Open rounds as an upper bound, counting both debaters per round', () => {
    const line = describeFormatLine({
      label: 'Open rounds',
      isOpenRounds: true,
      turnDurationsMs: [60_000, 60_000],
      openRounds: { maxRebuttalRounds: 3, rebuttalTurnMs: 45_000 },
    });

    // 2 openings (2 min) + 3 rounds × 2 debaters × 45s (4 min 30s).
    expect(line).toBe('Open rounds · up to 6 min 30s total');
    expect(line).toContain('up to');
  });

  // Open rounds before the cap is known. The label came off the format id and the wording off the cap object.
  it('states Open rounds as a floor when the cap is not known yet', () => {
    const line = describeFormatLine({ label: 'Open rounds', isOpenRounds: true, turnDurationsMs: [60_000, 60_000] });

    expect(line).toBe('Open rounds · at least 2 min');
    expect(line).not.toContain('total');
  });

  it('does not promise a format label it was not given', () => {
    expect(describeFormatLine({ label: null, turnDurationsMs: [30_000, 30_000] })).toBe('1 min total');
  });
});

describe('formatTotalSpeakingTime', () => {
  it('reads as minutes where it divides, and never as a bare second count above a minute', () => {
    expect(formatTotalSpeakingTime(240_000)).toBe('4 min');
    expect(formatTotalSpeakingTime(270_000)).toBe('4 min 30s');
    expect(formatTotalSpeakingTime(45_000)).toBe('45s');
  });
});

describe('inheritedJoinState', () => {
  it('reads the chosen state off the devices that were handed over', () => {
    expect(inheritedJoinState(['audio', 'video'])).toEqual({ audioMuted: false, videoEnabled: true });
    expect(inheritedJoinState(['audio'])).toEqual({ audioMuted: false, videoEnabled: false });
    expect(inheritedJoinState(['video'])).toEqual({ audioMuted: true, videoEnabled: true });
  });

  it('falls back to the old defaults when no devices were inherited', () => {
    expect(inheritedJoinState([])).toEqual({ audioMuted: false, videoEnabled: true });
  });
});

describe('kindsForJoinState', () => {
  it('does not ask for a camera the card left off', () => {
    expect(kindsForJoinState({ audioMuted: false, videoEnabled: false }, ['audio'])).toEqual({
      audio: true,
      video: false,
    });
  });

  it('asks for both on a cold arrival, where the room defaults apply', () => {
    expect(kindsForJoinState({ audioMuted: false, videoEnabled: true }, [])).toEqual({ audio: true, video: true });
  });

  it('never asks for less than what is already open', () => {
    expect(kindsForJoinState({ audioMuted: true, videoEnabled: false }, ['audio', 'video'])).toEqual({
      audio: true,
      video: true,
    });
  });
});

describe('joinStateNeedsOpening', () => {
  it('needs the camera when the card handed over the microphone only', () => {
    expect(joinStateNeedsOpening({ audioMuted: false, videoEnabled: true }, ['audio'])).toBe(true);
  });

  it('needs the microphone when the card handed over the camera only', () => {
    expect(joinStateNeedsOpening({ audioMuted: false, videoEnabled: true }, ['video'])).toBe(true);
  });

  it('needs nothing when both kinds are already open', () => {
    expect(joinStateNeedsOpening({ audioMuted: false, videoEnabled: true }, ['audio', 'video'])).toBe(false);
  });

  it('needs nothing when a device is being turned off, or was never wanted', () => {
    expect(joinStateNeedsOpening({ audioMuted: true, videoEnabled: true }, ['audio', 'video'])).toBe(false);
    expect(joinStateNeedsOpening({ audioMuted: false, videoEnabled: false }, ['audio'])).toBe(false);
    expect(joinStateNeedsOpening({ audioMuted: true, videoEnabled: false }, [])).toBe(false);
  });
});
