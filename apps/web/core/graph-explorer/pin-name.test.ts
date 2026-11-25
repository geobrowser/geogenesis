import { describe, expect, it } from 'vitest';

import { nameAt, placeName } from './pin-name';

// A 100px-wide pin: a 20px marker box over a 30px name.
const pin = (x: number, y: number) => ({ x, y, anchor: 10, width: 100, height: 54 });
const stage = { width: 390, height: 700 };

describe('nameAt', () => {
  it('lays the name out below, beside or above the marker', () => {
    expect(nameAt('below', pin(195, 300), 390).rect).toEqual({ left: 145, right: 245, top: 314, bottom: 344 });
    expect(nameAt('above', pin(195, 300), 390).rect).toEqual({ left: 145, right: 245, top: 256, bottom: 286 });
    expect(nameAt('left', pin(195, 300), 390).rect).toEqual({ left: 81, right: 181, top: 285, bottom: 315 });
    expect(nameAt('right', pin(195, 300), 390).rect).toEqual({ left: 209, right: 309, top: 285, bottom: 315 });
  });
});

describe('placeName', () => {
  it('keeps the name below when nothing is in the way', () => {
    expect(placeName(pin(195, 300), stage, [], 'below')).toMatchObject({ place: 'below', clear: true, dx: 0, dy: 0 });
  });

  it('moves a name off an overlay, and off the bottom of the stage', () => {
    const zoom = { left: 330, right: 380, top: 280, bottom: 500 };
    expect(placeName(pin(340, 300), stage, [zoom], 'below').place).toBe('left');
    expect(placeName(pin(195, 680), stage, [], 'below').place).toBe('left');
    expect(placeName(pin(195, 690), stage, [], 'below').place).toBe('above');
  });

  it('keeps the place it has while it stays clear, so a name does not hop', () => {
    expect(placeName(pin(195, 300), stage, [], 'right').place).toBe('right');
  });

  it('says so when no place is clear', () => {
    const wall = { left: 0, right: 390, top: 0, bottom: 700 };
    expect(placeName(pin(195, 300), stage, [wall], 'left')).toMatchObject({ place: 'below', clear: false });
  });
});
