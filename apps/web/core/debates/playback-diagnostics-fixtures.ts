/**
 * DOM stand-ins for what `DebateFeedPlayer` puts on the page, shared by the diagnostic's two
 * suites — the readout's own, and the one that needs a fresh module to check install ordering.
 */

/**
 * jsdom lays nothing out, so every element measures 0×0 and would read as off screen. Sizes are
 * assigned per element instead, which is also the only way to place one deliberately out of view.
 */
export function placeAt(element: Element, box: { top: number; left: number; width: number; height: number }) {
  element.getBoundingClientRect = () =>
    ({
      top: box.top,
      left: box.left,
      right: box.left + box.width,
      bottom: box.top + box.height,
      width: box.width,
      height: box.height,
      x: box.left,
      y: box.top,
      toJSON: () => ({}),
    }) as DOMRect;
}

export const ON_SCREEN = { top: 10, left: 0, width: 300, height: 200 };
export const OFF_TO_THE_SIDE = { top: 10, left: 5_000, width: 300, height: 200 };

/** A debate card as `DebateFeedPlayer` publishes it: the state attributes, with its videos inside. */
export function debateCard(state: { playing: boolean; blocked: boolean }) {
  const card = document.createElement('div');
  card.setAttribute('data-debate-ready', 'true');
  card.setAttribute('data-debate-active', 'true');
  card.setAttribute('data-debate-playing', String(state.playing));
  card.setAttribute('data-debate-autoplay-blocked', String(state.blocked));
  placeAt(card, ON_SCREEN);

  const video = document.createElement('video');
  placeAt(video, ON_SCREEN);
  card.append(video);

  return { card, video };
}
