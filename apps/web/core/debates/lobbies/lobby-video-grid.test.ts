import { describe, expect, it } from 'vitest';

import {
  EMPTY_VIDEO_GRID,
  type VideoGridSpeaker,
  type VideoGridState,
  nextVideoGrid,
  sameVideoGrid,
  videoGridColumns,
} from './lobby-video-grid';

function speaker(id: string, extra: Partial<VideoGridSpeaker> = {}): VideoGridSpeaker {
  return { id, pinned: false, speaking: false, camera: true, ...extra };
}

/** `count` speakers named s0, s1, …, cameras on, nobody talking. */
function room(count: number, extra: (index: number) => Partial<VideoGridSpeaker> = () => ({})) {
  return Array.from({ length: count }, (_, index) => speaker(`s${index}`, extra(index)));
}

function step(prev: VideoGridState, speakers: VideoGridSpeaker[], cap = 3) {
  return nextVideoGrid(prev, speakers, cap);
}

describe('nextVideoGrid', () => {
  it('gives everyone a tile in roster order up to the cap', () => {
    expect(step(EMPTY_VIDEO_GRID, room(3)).shown).toEqual(['s0', 's1', 's2']);
  });

  it('over the cap, picks the viewer and hosts, then talkers, then cameras on, laid out in roster order', () => {
    const speakers = [
      speaker('quiet-off', { camera: false }),
      speaker('quiet-on'),
      speaker('talking', { speaking: true }),
      speaker('host', { pinned: true, camera: false }),
    ];
    expect(step(EMPTY_VIDEO_GRID, speakers).shown).toEqual(['quiet-on', 'talking', 'host']);
  });

  it('sends a newcomer past the cap to the row without moving anyone', () => {
    const full = step(EMPTY_VIDEO_GRID, room(3));
    const next = step(full, [...room(3), speaker('late')]);
    expect(next.shown).toEqual(['s0', 's1', 's2']);
  });

  it('puts someone in the row who starts talking on the tile of whoever has been quiet longest', () => {
    // s1 talks and stops, so s0 and s2 have been quiet longer; s0 is earlier in the roster but
    // both never spoke, so the later one in the roster goes first.
    let grid = step(EMPTY_VIDEO_GRID, room(4));
    grid = step(
      grid,
      room(4, index => ({ speaking: index === 1 }))
    );
    grid = step(grid, room(4));
    expect(grid.shown).toEqual(['s0', 's1', 's2']);

    grid = step(
      grid,
      room(4, index => ({ speaking: index === 3 }))
    );
    expect(grid.shown).toEqual(['s0', 's1', 's3']);
  });

  it('keeps someone who spoke recently over someone who never did', () => {
    let grid = step(EMPTY_VIDEO_GRID, room(4));
    grid = step(
      grid,
      room(4, index => ({ speaking: index === 2 }))
    );
    grid = step(grid, room(4));
    grid = step(
      grid,
      room(4, index => ({ speaking: index === 3 }))
    );
    expect(grid.shown).toEqual(['s0', 's3', 's2']);
  });

  it('gives up a camera that is off before one that is on, between equally quiet people', () => {
    let grid = step(EMPTY_VIDEO_GRID, room(4));
    grid = step(
      grid,
      room(4, index => ({ camera: index !== 0, speaking: index === 3 }))
    );
    expect(grid.shown).toEqual(['s3', 's1', 's2']);
  });

  it('never takes a tile from the viewer, a host or someone talking', () => {
    const base = (index: number) => ({ pinned: index === 0, speaking: index === 1 || index === 2 });
    let grid = step(EMPTY_VIDEO_GRID, room(3, base));
    grid = step(
      grid,
      room(4, index => ({ ...base(index), speaking: index > 0 }))
    );
    // Everyone on the grid is pinned or talking, so the new talker waits in the row.
    expect(grid.shown).toEqual(['s0', 's1', 's2']);
  });

  it('fills a tile someone left in place, by the same priority, without moving the others', () => {
    const speakers = [speaker('a'), speaker('b'), speaker('c'), speaker('off', { camera: false }), speaker('on')];
    let grid = step(EMPTY_VIDEO_GRID, speakers);
    expect(grid.shown).toEqual(['a', 'b', 'c']);
    grid = step(
      grid,
      speakers.filter(entry => entry.id !== 'b')
    );
    expect(grid.shown).toEqual(['a', 'on', 'c']);
  });

  it('keeps every tile in place when someone near the front leaves a big room', () => {
    let grid = step(EMPTY_VIDEO_GRID, room(8), 6);
    expect(grid.shown).toEqual(['s0', 's1', 's2', 's3', 's4', 's5']);
    grid = step(
      grid,
      room(8).filter(entry => entry.id !== 's0'),
      6
    );
    expect(grid.shown).toEqual(['s6', 's1', 's2', 's3', 's4', 's5']);
  });

  it('keeps the tiles where they are when the room drops back under the cap', () => {
    // s3 talked its way onto s2's tile; once s1 leaves, everyone fits again. s3 keeps its place
    // ahead of s2 rather than the grid re-sorting into roster order.
    let grid = step(EMPTY_VIDEO_GRID, room(4));
    grid = step(
      grid,
      room(4, index => ({ speaking: index === 3 }))
    );
    expect(grid.shown).toEqual(['s0', 's1', 's3']);
    grid = step(
      grid,
      room(4).filter(entry => entry.id !== 's1')
    );
    expect(grid.shown).toEqual(['s0', 's3', 's2']);
  });

  it('never moves someone held: their tile is not taken, and their chip does not jump to the grid', () => {
    let grid = step(EMPTY_VIDEO_GRID, room(4));
    // s2 would be quiet longest and give up their tile, but their menu is open.
    grid = step(
      grid,
      room(4, index => ({ speaking: index === 3, held: index === 2 }))
    );
    expect(grid.shown).toEqual(['s0', 's3', 's2']);

    // s1 is in the row with their chip focused: talking does not pull them onto the grid.
    grid = step(
      grid,
      room(4, index => ({ speaking: index === 1, held: index === 1 }))
    );
    expect(grid.shown).toEqual(['s0', 's3', 's2']);
  });

  it('leaves a held chip in the row when everyone would otherwise fit, until the hold ends', () => {
    let grid = step(EMPTY_VIDEO_GRID, room(4));
    expect(grid.shown).toEqual(['s0', 's1', 's2']);
    const held = room(4, index => ({ held: index === 3 })).filter(entry => entry.id !== 's1');
    grid = step(grid, held);
    expect(grid.shown).toEqual(['s0', 's2']);
    grid = step(
      grid,
      room(4).filter(entry => entry.id !== 's1')
    );
    expect(grid.shown).toEqual(['s0', 's2', 's3']);
  });

  it('leaves a held chip out when the grid empties and is picked afresh', () => {
    // Everyone on the grid leaves at once; the room is still over the cap, and s3's chip has focus.
    let grid = step(EMPTY_VIDEO_GRID, room(7));
    expect(grid.shown).toEqual(['s0', 's1', 's2']);
    grid = step(grid, room(7, index => ({ held: index === 3 })).slice(3));
    expect(grid.shown).toEqual(['s4', 's5', 's6']);
  });

  it('leaves a held chip in the row when they become a host', () => {
    let grid = step(EMPTY_VIDEO_GRID, room(4));
    grid = step(
      grid,
      room(4, index => ({ pinned: index === 3, held: index === 3 }))
    );
    expect(grid.shown).toEqual(['s0', 's1', 's2']);
    // The hold ends: now they take a tile.
    grid = step(
      grid,
      room(4, index => ({ pinned: index === 3 }))
    );
    expect(grid.shown).toContain('s3');
  });

  it('gives someone in the row whose camera comes on the tile of the quietest camera that is off', () => {
    let grid = step(
      EMPTY_VIDEO_GRID,
      room(5, index => ({ camera: index === 1 }))
    );
    expect(grid.shown).toEqual(['s0', 's1', 's2']);
    grid = step(
      grid,
      room(5, index => ({ camera: index === 1 || index === 4 }))
    );
    // s2 is the latest camera-off tile in the roster; s1's camera tile is never taken for a camera.
    expect(grid.shown).toEqual(['s0', 's1', 's4']);
  });

  it('catches up a grid picked before any camera arrived, without taking a camera tile', () => {
    // The first pick runs before voice connects, so nobody has a camera yet.
    let grid = step(
      EMPTY_VIDEO_GRID,
      room(14, () => ({ camera: false })),
      12
    );
    expect(grid.shown).not.toContain('s13');
    grid = step(
      grid,
      room(14, index => ({ camera: index === 13 })),
      12
    );
    expect(grid.shown).toContain('s13');
    expect(grid.shown).toHaveLength(12);
  });

  it('keeps a tile whose camera goes off, and waits for a camera-off tile to swap', () => {
    let grid = step(EMPTY_VIDEO_GRID, room(4));
    grid = step(
      grid,
      room(4, index => ({ camera: index !== 1 }))
    );
    expect(grid.shown).toEqual(['s0', 's1', 's2']);
  });

  it('drops tiles from the end for a smaller cap, keeping a held one', () => {
    let grid = step(EMPTY_VIDEO_GRID, room(14), 12);
    expect(grid.shown).toHaveLength(12);
    grid = step(
      grid,
      room(14, index => ({ held: index === 11 })),
      9
    );
    expect(grid.shown).toEqual(['s0', 's1', 's2', 's3', 's4', 's5', 's6', 's7', 's11']);
  });

  it('keeps a camera that came on while their chip was held, and swaps them once the hold ends', () => {
    let grid = step(
      EMPTY_VIDEO_GRID,
      room(4, () => ({ camera: false }))
    );
    expect(grid.shown).toEqual(['s0', 's1', 's2']);
    // s3's camera comes on while their chip has focus: they stay in the row.
    grid = step(
      grid,
      room(4, index => ({ camera: index === 3, held: index === 3 }))
    );
    expect(grid.shown).toEqual(['s0', 's1', 's2']);
    // Focus leaves: the camera still counts as coming on.
    grid = step(
      grid,
      room(4, index => ({ camera: index === 3 }))
    );
    expect(grid.shown).toEqual(['s0', 's1', 's3']);
  });

  it('drops talkers before the viewer or a host for a smaller cap', () => {
    // A host at s0, talkers at s1 to s10, the viewer at s11.
    const speakers = (talking: boolean) =>
      room(12, index => ({ pinned: index === 0 || index === 11, speaking: talking && index > 0 && index < 11 }));
    let grid = step(EMPTY_VIDEO_GRID, speakers(false), 12);
    grid = step(grid, speakers(true), 9);
    expect(grid.shown).toEqual(['s0', 's1', 's2', 's3', 's4', 's5', 's6', 's7', 's11']);
  });

  it('fills a gap with someone who is not held', () => {
    let grid = step(EMPTY_VIDEO_GRID, room(5));
    grid = step(
      grid,
      room(5, index => ({ held: index === 3 })).filter(entry => entry.id !== 's1')
    );
    expect(grid.shown).toEqual(['s0', 's4', 's2']);
  });

  it('settles: the same speakers give an equal state, so re-rendering does not loop', () => {
    const speakers = room(5, index => ({ speaking: index === 4 }));
    const once = step(EMPTY_VIDEO_GRID, speakers);
    expect(sameVideoGrid(once, step(once, speakers))).toBe(true);
  });
});

describe('videoGridColumns', () => {
  it('goes 2 across up to 4 tiles, 3 up to 9, then 4; a phone stops at 3', () => {
    expect([1, 4, 5, 9, 10, 12].map(count => videoGridColumns(count, false))).toEqual([2, 2, 3, 3, 4, 4]);
    expect([4, 5, 9].map(count => videoGridColumns(count, true))).toEqual([2, 3, 3]);
  });
});
