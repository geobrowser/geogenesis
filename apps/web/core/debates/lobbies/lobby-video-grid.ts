/**
 * Which speakers get a video tile once lobby video is on (GEO-3399), and where.
 *
 * Up to the cap, everyone gets a tile in roster order. Past it, the grid holds `cap` tiles and the
 * rest wait in the "More speakers" row. Who gets a tile: the viewer and hosts always, then whoever is
 * talking, then cameras on, then cameras off. Once someone has a tile it stays in the same place:
 * when a person in the row starts talking they take the tile of whoever on the grid has been quiet
 * longest, and nobody else moves. A grid that reshuffles on every voice is unreadable.
 *
 * Pure, so the page can keep the previous result in state and feed it back in; the same inputs give
 * the same state, so re-rendering never churns it.
 */

/** A desktop lobby fits 4 rows of 3 or 3 of 4 above Listening; a phone, 3 rows of 3. */
export const LOBBY_VIDEO_GRID_CAP = { desktop: 12, phone: 9 } as const;

export type VideoGridSpeaker = {
  id: string;
  /** The viewer and hosts: never sent to the row. */
  pinned: boolean;
  speaking: boolean;
  camera: boolean;
};

export type VideoGridState = {
  /** Ids holding a tile, in tile order. */
  shown: string[];
  /** Who was speaking when this was last computed, to catch someone starting or stopping. */
  speaking: string[];
  /** A logical clock: bumped on each change of who is speaking. */
  tick: number;
  /** When each id last started or stopped speaking, on `tick`'s clock. */
  spokeAt: Record<string, number>;
};

export const EMPTY_VIDEO_GRID: VideoGridState = { shown: [], speaking: [], tick: 0, spokeAt: {} };

export function nextVideoGrid(prev: VideoGridState, speakers: VideoGridSpeaker[], cap: number): VideoGridState {
  const ids = speakers.map(speaker => speaker.id);
  const present = new Set(ids);
  const byId = new Map(speakers.map(speaker => [speaker.id, speaker]));

  // Who started or stopped speaking since last time gets the next tick.
  const speakingNow = speakers.filter(speaker => speaker.speaking).map(speaker => speaker.id);
  const wasSpeaking = new Set(prev.speaking);
  const isSpeaking = new Set(speakingNow);
  const changed = [
    ...speakingNow.filter(id => !wasSpeaking.has(id)),
    ...prev.speaking.filter(id => !isSpeaking.has(id) && present.has(id)),
  ];
  const tick = changed.length > 0 ? prev.tick + 1 : prev.tick;
  const spokeAt: Record<string, number> = {};
  for (const id of ids) {
    const at = changed.includes(id) ? tick : prev.spokeAt[id];
    if (at !== undefined) spokeAt[id] = at;
  }

  const shown = ids.length <= cap ? ids : pickTiles(prev.shown, speakers, byId, spokeAt, cap);
  return { shown, speaking: speakingNow, tick, spokeAt };
}

function pickTiles(
  prevShown: string[],
  speakers: VideoGridSpeaker[],
  byId: Map<string, VideoGridSpeaker>,
  spokeAt: Record<string, number>,
  cap: number
): string[] {
  const order = new Map(speakers.map((speaker, index) => [speaker.id, index]));
  const kept = prevShown.filter(id => byId.has(id));

  // First time over the cap (a fresh page, or a 13th speaker arriving with nobody shown yet): pick
  // by priority, then lay the picks out in roster order so the grid reads like the roster.
  if (kept.length === 0) {
    const ranked = [...speakers].sort((a, b) => rank(a) - rank(b) || order.get(a.id)! - order.get(b.id)!);
    return ranked
      .slice(0, cap)
      .map(speaker => speaker.id)
      .sort((a, b) => order.get(a)! - order.get(b)!);
  }

  const tiles = kept.slice(0, cap);
  const onGrid = new Set(tiles);
  // Who can give a tile up: not pinned, not talking. Quiet longest first; among equals, a camera
  // that is off before one that is on, then the later in the roster.
  const evictable = () =>
    tiles
      .map((id, index) => ({ id, index }))
      .filter(({ id }) => !byId.get(id)!.pinned && !byId.get(id)!.speaking)
      .sort(
        (a, b) =>
          (spokeAt[a.id] ?? -1) - (spokeAt[b.id] ?? -1) ||
          Number(byId.get(a.id)!.camera) - Number(byId.get(b.id)!.camera) ||
          order.get(b.id)! - order.get(a.id)!
      );

  const claim = (id: string) => {
    if (onGrid.has(id)) return;
    if (tiles.length < cap) {
      tiles.push(id);
    } else {
      const out = evictable()[0];
      if (!out) return;
      onGrid.delete(out.id);
      tiles[out.index] = id;
    }
    onGrid.add(id);
  };

  for (const speaker of speakers) if (speaker.pinned) claim(speaker.id);
  for (const speaker of speakers) if (speaker.speaking) claim(speaker.id);

  // Free tiles (someone left) fill by the same priority, without moving anyone already shown.
  const waiting = speakers
    .filter(speaker => !onGrid.has(speaker.id))
    .sort((a, b) => rank(a) - rank(b) || order.get(a.id)! - order.get(b.id)!);
  for (const speaker of waiting) {
    if (tiles.length >= cap) break;
    tiles.push(speaker.id);
    onGrid.add(speaker.id);
  }
  return tiles;
}

function rank(speaker: VideoGridSpeaker) {
  if (speaker.pinned) return 0;
  if (speaker.speaking) return 1;
  return speaker.camera ? 2 : 3;
}

export function sameVideoGrid(a: VideoGridState, b: VideoGridState) {
  return (
    a.tick === b.tick &&
    sameList(a.shown, b.shown) &&
    sameList(a.speaking, b.speaking) &&
    sameList(Object.keys(a.spokeAt), Object.keys(b.spokeAt)) &&
    Object.keys(a.spokeAt).every(id => a.spokeAt[id] === b.spokeAt[id])
  );
}

function sameList(a: string[], b: string[]) {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

/**
 * Columns for the tiles shown: 2 across up to 4, 3 up to 9, then 4. A phone stops at 3. The desktop
 * column count is a ceiling; a narrow window drops a column first (see the grid's classes).
 */
export function videoGridColumns(shown: number, phone: boolean): 2 | 3 | 4 {
  if (shown <= 4) return 2;
  if (shown <= 9 || phone) return 3;
  return 4;
}
