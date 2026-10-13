import { beforeEach, describe, expect, it } from 'vitest';

import {
  clearRematchJoinIntents,
  hasAnsweredRematchJoin,
  markRematchAnswered,
  readRematchJoinIntent,
  rememberRematchJoinIntent,
} from './rematch-join-intent';

beforeEach(clearRematchJoinIntents);

describe('rematch join intent', () => {
  it('hands back what was recorded, per session', () => {
    rememberRematchJoinIntent('a', { micOn: true, cameraOn: false });
    rememberRematchJoinIntent('b', { micOn: false, cameraOn: true });

    expect(readRematchJoinIntent('a')).toEqual({ micOn: true, cameraOn: false });
    expect(readRematchJoinIntent('b')).toEqual({ micOn: false, cameraOn: true });
  });

  it('reports nothing for a session nobody chose for', () => {
    expect(readRematchJoinIntent('never-seen')).toBeNull();
    expect(readRematchJoinIntent('')).toBeNull();
  });

  it('keeps a recorded choice apart from having answered', () => {
    rememberRematchJoinIntent('a', { micOn: true, cameraOn: true });

    expect(hasAnsweredRematchJoin('a')).toBe(false);

    markRematchAnswered('a');

    expect(hasAnsweredRematchJoin('a')).toBe(true);
    expect(readRematchJoinIntent('a')).toEqual({ micOn: true, cameraOn: true });
  });

  it('bounds what it remembers', () => {
    for (let index = 0; index < 25; index += 1) {
      rememberRematchJoinIntent(`session-${index}`, { micOn: true, cameraOn: false });
      markRematchAnswered(`session-${index}`);
    }

    expect(readRematchJoinIntent('session-0')).toBeNull();
    expect(hasAnsweredRematchJoin('session-0')).toBe(false);
    expect(readRematchJoinIntent('session-24')).toEqual({ micOn: true, cameraOn: false });
    expect(hasAnsweredRematchJoin('session-24')).toBe(true);
  });

  it('does not evict when a session it already knows is written again', () => {
    for (let index = 0; index < 20; index += 1) {
      rememberRematchJoinIntent(`session-${index}`, { micOn: true, cameraOn: false });
    }

    rememberRematchJoinIntent('session-0', { micOn: false, cameraOn: true });

    expect(readRematchJoinIntent('session-0')).toEqual({ micOn: false, cameraOn: true });
    expect(readRematchJoinIntent('session-19')).not.toBeNull();
  });
});
