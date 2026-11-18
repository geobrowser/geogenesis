import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ENTITY_COMMENTS_ANCHOR_ID } from './entity-comments-anchor';
import { holdCommentsInView } from './hold-comments-in-view';

// The side panel's container is covered by `use-scroll-to-comments-on-open.test.tsx`; this is the
// full page, whose scroller is the viewport.
describe('holdCommentsInView on the page', () => {
  const page = () => document.documentElement;
  let offset = 0;
  let anchor: HTMLElement;

  beforeEach(() => {
    vi.useFakeTimers();
    // jsdom has no `scrollingElement`; a browser in standards mode reports the root element.
    Object.defineProperty(document, 'scrollingElement', { configurable: true, get: () => document.documentElement });
    page().scrollTop = 0;
    anchor = document.createElement('div');
    anchor.id = ENTITY_COMMENTS_ANCHOR_ID;
    // jsdom does no layout: the section reports where it sits on the page, less the scroll.
    anchor.getBoundingClientRect = () => ({ top: offset - page().scrollTop }) as DOMRect;
    // The viewport's own rect moves with the scroll; that must not count against the target.
    page().getBoundingClientRect = () => ({ top: -page().scrollTop }) as DOMRect;
  });

  afterEach(() => {
    Reflect.deleteProperty(document, 'scrollingElement');
    anchor.remove();
    document.body.replaceChildren();
    vi.useRealTimers();
  });

  async function flushObservers() {
    await Promise.resolve();
  }

  it('scrolls the page to the section, and follows it down while what is above it loads', async () => {
    offset = 600;
    document.body.append(anchor);
    const stop = holdCommentsInView(page());
    expect(page().scrollTop).toBe(600);

    // The backlinks above it load.
    offset = 900;
    document.body.prepend(document.createElement('div'));
    await flushObservers();
    expect(page().scrollTop).toBe(900);

    stop();
  });

  it('waits for a section that renders after the link is read', async () => {
    offset = 400;
    const stop = holdCommentsInView(page());
    expect(page().scrollTop).toBe(0);

    document.body.append(anchor);
    await flushObservers();
    expect(page().scrollTop).toBe(400);

    stop();
  });

  it('lets go once the reader scrolls', async () => {
    offset = 600;
    document.body.append(anchor);
    const stop = holdCommentsInView(page());

    page().dispatchEvent(new Event('wheel'));
    page().scrollTop = 100;
    offset = 900;
    document.body.prepend(document.createElement('div'));
    await flushObservers();
    expect(page().scrollTop).toBe(100);

    stop();
  });

  // On the page the section is there at once; a slow phone can take longer than one hold to load
  // what sits above it.
  it('keeps following while the content above keeps arriving, past the first hold', async () => {
    offset = 600;
    document.body.append(anchor);
    const stop = holdCommentsInView(page());

    vi.advanceTimersByTime(1_500);
    offset = 800;
    document.body.prepend(document.createElement('div'));
    await flushObservers();
    expect(page().scrollTop).toBe(800);

    vi.advanceTimersByTime(1_500);
    offset = 1_000;
    document.body.prepend(document.createElement('div'));
    await flushObservers();
    expect(page().scrollTop).toBe(1_000);

    stop();
  });

  it('stops following after its overall cap, however long the page keeps moving', async () => {
    offset = 600;
    document.body.append(anchor);
    holdCommentsInView(page());

    for (let i = 1; i <= 6; i++) {
      vi.advanceTimersByTime(1_900);
      offset = 600 + i * 100;
      document.body.prepend(document.createElement('div'));
      await flushObservers();
    }
    // 11.4 s in: the last growth is past the 10 s cap.
    expect(page().scrollTop).toBe(1_100);
  });

  it('lands the section clear of what is pinned over the page, by its scroll margin', () => {
    offset = 600;
    anchor.style.scrollMarginTop = '52px';
    document.body.append(anchor);
    const stop = holdCommentsInView(page());

    expect(page().scrollTop).toBe(548);

    stop();
  });
});
