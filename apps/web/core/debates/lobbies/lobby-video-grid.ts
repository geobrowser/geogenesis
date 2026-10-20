/**
 * Which speakers get a video tile once lobby video is on (GEO-3399), and where.
 *
 * Up to the cap, everyone gets a tile: a fresh grid in roster order, newcomers after. Past it, the
 * grid holds `cap` tiles and the rest wait in the "More speakers" row. Who gets a tile: the viewer
 * and hosts always, then whoever is talking, then cameras on, then cameras off.
 *
 * Once someone has a tile it stays in the same place. Someone in the row who starts talking takes
 * the tile of whoever on the grid has been quiet longest; someone in the row whose camera comes on
 * takes the tile of the quietest whose camera is off (this is also how a grid picked before cameras
 * arrived catches up). Someone leaving leaves a gap that is filled in place, and a smaller cap (a
 * phone) drops tiles from the end, never a held, hosting or talking one. Nobody else moves, and nobody being held (their tile or chip has focus, or a menu open
 * from it) moves at all. A grid that reshuffles on every voice is unreadable, and a tile taken out
 * from under a menu takes the menu with it.
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
  /** Focus is on their tile or chip, or in a menu opened from it: they stay where they are. */
  held?: boolean;
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
  /** Whose camera was on when this was last computed, to catch one coming on. */
  cameras: string[];
};

export const EMPTY_VIDEO_GRID: VideoGridState = { shown: [], speaking: [], tick: 0, spokeAt: {}, cameras: [] };

export function nextVideoGrid(prev: VideoGridState, speakers: VideoGridSpeaker[], cap: number): VideoGridState {
  const ids = speakers.map(speaker => speaker.id);
  const present = new Set(ids);

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

  const camerasNow = speakers.filter(speaker => speaker.camera).map(speaker => speaker.id);
  const hadCamera = new Set(prev.cameras);
  const cameraCameOn = new Set(camerasNow.filter(id => !hadCamera.has(id)));

  return {
    shown: placeTiles(prev.shown, speakers, spokeAt, cameraCameOn, cap),
    speaking: speakingNow,
    tick,
    spokeAt,
    cameras: camerasNow,
  };
}

function placeTiles(
  prevShown: string[],
  speakers: VideoGridSpeaker[],
  spokeAt: Record<string, number>,
  cameraCameOn: ReadonlySet<string>,
  cap: number
): string[] {
  const byId = new Map(speakers.map(speaker => [speaker.id, speaker]));
  const order = new Map(speakers.map((speaker, index) => [speaker.id, index]));
  const byPriority = (a: VideoGridSpeaker, b: VideoGridSpeaker) =>
    rank(a) - rank(b) || order.get(a.id)! - order.get(b.id)!;

  // Every tile where it was; someone who left leaves a gap (null) to fill in place.
  const slots: (string | null)[] = prevShown.map(id => (byId.has(id) ? id : null));
  // A smaller cap (desktop to phone): gaps go first, then, from the end, tiles that could give theirs
  // up anyway. A held, hosting or talking tile stays; last of all, anyone not held.
  const trim = (droppable: (id: string) => boolean) => {
    for (let index = slots.length - 1; index >= 0 && slots.length > cap; index--) {
      const id = slots[index];
      if (id === null || droppable(id)) slots.splice(index, 1);
    }
  };
  trim(() => false);
  trim(id => {
    const speaker = byId.get(id)!;
    return !speaker.held && !speaker.pinned && !speaker.speaking;
  });
  trim(id => !byId.get(id)!.held);
  const onGrid = new Set(slots.filter((id): id is string => id !== null));
  const notShown = speakers.filter(speaker => !onGrid.has(speaker.id));

  // Room for everyone: gaps close up, newcomers go after, in roster order. Someone held in the row
  // stays there until the hold ends, rather than their chip being swapped for a tile under focus.
  if (speakers.length <= cap) {
    return [...onGrid, ...notShown.filter(speaker => !speaker.held).map(speaker => speaker.id)];
  }

  // First time over the cap (a fresh page with a full room): pick by priority, then lay the picks out
  // in roster order so the grid reads like the roster.
  if (onGrid.size === 0) {
    return speakers
      .filter(speaker => !speaker.held)
      .sort(byPriority)
      .slice(0, cap)
      .map(speaker => speaker.id)
      .sort((a, b) => order.get(a)! - order.get(b)!);
  }

  const movable = (id: string) => !byId.get(id)!.held;
  // Who can give a tile up: not pinned, not talking, not held, and for a camera coming on, only
  // someone whose camera is off. Quiet longest first; among equals, a camera that is off before one
  // that is on, then the later in the roster.
  const evictable = (cameraOffOnly: boolean) =>
    slots
      .map((id, index) => ({ id, index }))
      .filter((slot): slot is { id: string; index: number } => {
        if (slot.id === null) return false;
        const speaker = byId.get(slot.id)!;
        return !speaker.pinned && !speaker.speaking && movable(slot.id) && !(cameraOffOnly && speaker.camera);
      })
      .sort(
        (a, b) =>
          (spokeAt[a.id] ?? -1) - (spokeAt[b.id] ?? -1) ||
          Number(byId.get(a.id)!.camera) - Number(byId.get(b.id)!.camera) ||
          order.get(b.id)! - order.get(a.id)!
      );

  // A held chip stays a chip, whatever would bring them to the grid: talking, hosting, a gap.
  const claim = (id: string, cameraOffOnly = false) => {
    if (onGrid.has(id) || !movable(id)) return;
    const gap = slots.indexOf(null);
    if (gap !== -1) {
      slots[gap] = id;
    } else if (slots.length < cap) {
      slots.push(id);
    } else {
      const out = evictable(cameraOffOnly)[0];
      if (!out) return;
      onGrid.delete(out.id);
      slots[out.index] = id;
    }
    onGrid.add(id);
  };

  for (const speaker of speakers) if (speaker.pinned) claim(speaker.id);
  for (const speaker of speakers) if (speaker.speaking) claim(speaker.id);
  for (const speaker of speakers) if (cameraCameOn.has(speaker.id)) claim(speaker.id, true);
  // Gaps, and room left by a smaller grid before, fill by the same priority.
  for (const speaker of [...notShown].sort(byPriority)) {
    if (!slots.includes(null) && slots.length >= cap) break;
    claim(speaker.id);
  }
  return slots.filter((id): id is string => id !== null);
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
    sameList(a.cameras, b.cameras) &&
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
