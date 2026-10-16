import { beforeEach, describe, expect, it } from 'vitest';

import {
  carryJoinIntentIntoDebate,
  clearRematchJoinIntents,
  hasAnsweredRematchJoin,
  isChosenJoinIntent,
  markRematchAnswered,
  readRematchJoinIntent,
  rememberRematchJoinIntent,
} from './rematch-join-intent';

beforeEach(clearRematchJoinIntents);

describe('rematch join intent', () => {
  it('hands back what was recorded, per session', () => {
    rememberRematchJoinIntent('a', { micOn: true, cameraOn: false, source: 'card' });
    rememberRematchJoinIntent('b', { micOn: false, cameraOn: true, source: 'card' });

    expect(readRematchJoinIntent('a')).toEqual({ micOn: true, cameraOn: false, source: 'card' });
    expect(readRematchJoinIntent('b')).toEqual({ micOn: false, cameraOn: true, source: 'card' });
  });

  it('reports nothing for a session nobody chose for', () => {
    expect(readRematchJoinIntent('never-seen')).toBeNull();
    expect(readRematchJoinIntent('')).toBeNull();
  });

  it('keeps a recorded choice apart from having answered', () => {
    rememberRematchJoinIntent('a', { micOn: true, cameraOn: true, source: 'card' });

    expect(hasAnsweredRematchJoin('a')).toBe(false);

    markRematchAnswered('a');

    expect(hasAnsweredRematchJoin('a')).toBe(true);
    expect(readRematchJoinIntent('a')).toEqual({ micOn: true, cameraOn: true, source: 'card' });
  });

  it('bounds what it remembers', () => {
    for (let index = 0; index < 25; index += 1) {
      rememberRematchJoinIntent(`session-${index}`, { micOn: true, cameraOn: false, source: 'card' });
      markRematchAnswered(`session-${index}`);
    }

    expect(readRematchJoinIntent('session-0')).toBeNull();
    expect(hasAnsweredRematchJoin('session-0')).toBe(false);
    expect(readRematchJoinIntent('session-24')).toEqual({ micOn: true, cameraOn: false, source: 'card' });
    expect(hasAnsweredRematchJoin('session-24')).toBe(true);
  });

  it('does not evict when a session it already knows is written again', () => {
    for (let index = 0; index < 20; index += 1) {
      rememberRematchJoinIntent(`session-${index}`, { micOn: true, cameraOn: false, source: 'card' });
    }

    rememberRematchJoinIntent('session-0', { micOn: false, cameraOn: true, source: 'card' });

    expect(readRematchJoinIntent('session-0')).toEqual({ micOn: false, cameraOn: true, source: 'card' });
    expect(readRematchJoinIntent('session-19')).not.toBeNull();
  });
});

describe('carryJoinIntentIntoDebate', () => {
  it('copies the picker’s choice onto the debate it became', () => {
    rememberRematchJoinIntent('session-9', { micOn: false, cameraOn: false, source: 'card' });

    carryJoinIntentIntoDebate('session-9', 'debate-9');

    expect(readRematchJoinIntent('debate-9')).toEqual({ micOn: false, cameraOn: false, source: 'card' });
  });

  it('records nothing for a session that chose nothing', () => {
    carryJoinIntentIntoDebate('session-unknown', 'debate-10');

    expect(readRematchJoinIntent('debate-10')).toBeNull();
  });
});

describe('isChosenJoinIntent', () => {
  it('counts a card’s, a room’s or a picker toggle’s mic, and not the picker’s echo of its default', () => {
    expect(isChosenJoinIntent({ micOn: false, source: 'card' })).toBe(true);
    expect(isChosenJoinIntent({ micOn: false, source: 'room' })).toBe(true);
    expect(isChosenJoinIntent({ micOn: false, source: 'picker' })).toBe(true);
    expect(isChosenJoinIntent({ micOn: false, source: null })).toBe(false);
    expect(isChosenJoinIntent(null)).toBe(false);
  });
});
