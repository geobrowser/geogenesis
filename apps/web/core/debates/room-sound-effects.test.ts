import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  ROOM_SOUND_EFFECTS_STORAGE_KEY,
  countInSound,
  createRoomSoundEngine,
  readRoomSoundEffectsEnabled,
  setRoomSoundEffectsEnabled,
  stampSound,
} from './room-sound-effects';

function installStorage() {
  const values = new Map<string, string>();
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => void values.set(key, value),
    removeItem: (key: string) => void values.delete(key),
    clear: () => values.clear(),
  };
  vi.stubGlobal('localStorage', storage);
  Object.defineProperty(window, 'localStorage', { value: storage, configurable: true });
  return values;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('countInSound', () => {
  it('builds: soft ticks first, two full ticks, then the ringing last one', () => {
    expect([5, 4, 3, 2, 1].map(countInSound)).toEqual(['tickSoft', 'tockSoft', 'tick', 'tock', 'tickLast']);
  });

  it('treats anything at or below one second as the last tick', () => {
    expect(countInSound(0)).toBe('tickLast');
  });
});

describe('stampSound', () => {
  it('maps each pick to its stamp, and no pick to the one that barely lands', () => {
    expect(stampSound('extend')).toBe('stampExtend');
    expect(stampSound('end')).toBe('stampEnd');
    expect(stampSound(null)).toBe('stampNone');
    expect(stampSound(undefined)).toBe('stampNone');
  });
});

describe('the sound effects preference', () => {
  it('defaults to on', () => {
    installStorage();
    expect(readRoomSoundEffectsEnabled()).toBe(true);
  });

  it('remembers off, and on again, in localStorage', () => {
    const values = installStorage();
    setRoomSoundEffectsEnabled(false);
    expect(values.get(ROOM_SOUND_EFFECTS_STORAGE_KEY)).toBe('off');
    expect(readRoomSoundEffectsEnabled()).toBe(false);
    setRoomSoundEffectsEnabled(true);
    expect(readRoomSoundEffectsEnabled()).toBe(true);
  });
});

describe('createRoomSoundEngine', () => {
  it('stays silent where there is no WebRTC to keep the sounds out of the recording', async () => {
    vi.stubGlobal('AudioContext', class {});
    vi.stubGlobal('RTCPeerConnection', undefined);
    await expect(createRoomSoundEngine()).resolves.toBeNull();
  });

  it('stays silent where there is no Web Audio', async () => {
    vi.stubGlobal('AudioContext', undefined);
    await expect(createRoomSoundEngine()).resolves.toBeNull();
  });
});
