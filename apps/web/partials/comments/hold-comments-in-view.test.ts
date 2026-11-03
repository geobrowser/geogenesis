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
});
