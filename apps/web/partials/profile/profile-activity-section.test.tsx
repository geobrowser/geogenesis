import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';

import * as React from 'react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { CLAIM_TYPE_ID } from '~/core/claims/ontology';
import type { ExploreFeedRow } from '~/core/explore/explore-card-item';

import { ProfileActivitySection } from './profile-activity-section';

const activityMocks = vi.hoisted(() => ({ unavailableDebateIds: new Set<string>() }));

// The gallery is local to the file under test, so its dependencies are mocked
// rather than the gallery itself.
vi.mock('~/partials/explore/explore-feed-card', () => ({
  ExploreFeedCard: ({
    item,
    onDebatePlaybackRequest,
    onDebatePlaybackAvailabilityChange,
  }: {
    item: { entityId: string };
    onDebatePlaybackRequest?: (debateId: string) => void;
    onDebatePlaybackAvailabilityChange?: (debateId: string, available: boolean) => void;
  }) => {
    const available = !activityMocks.unavailableDebateIds.has(item.entityId);
    React.useEffect(() => {
      onDebatePlaybackAvailabilityChange?.(item.entityId, available);
      return () => onDebatePlaybackAvailabilityChange?.(item.entityId, false);
    }, [available, item.entityId, onDebatePlaybackAvailabilityChange]);

    return (
      <button type="button" data-testid="card" onClick={() => onDebatePlaybackRequest?.(item.entityId)}>
        {item.entityId}
      </button>
    );
  },
}));

vi.mock('./gallery-claim-card', () => ({
  GalleryClaimCard: ({ row }: { row: ExploreFeedRow }) => <div data-testid="card">{row.entityId}</div>,
}));

vi.mock('~/core/hooks/use-space-labels', () => ({
  useSpaceLabels: () => ({ labelsById: new Map(), isLoading: false }),
  spaceLabel: () => undefined,
}));

vi.mock('~/core/debates/debate-playback-gate', () => ({
  DebatePlaybackGate: ({ allowedId, children }: { allowedId: string | null; children: React.ReactNode }) => (
    <div data-testid="playback-gate" data-allowed-id={allowedId}>
      {children}
    </div>
  ),
}));

vi.mock('~/design-system/prefetch-link', () => ({
  PrefetchLink: ({ children, href }: React.ComponentPropsWithoutRef<'a'>) => <a href={href}>{children}</a>,
}));

// `types` is read to tell a claim from a debate, so a row without it is not a
// row this component can draw.
const row = (entityId: string) => ({ entityId, spaceId: 'space', types: [] }) as unknown as ExploreFeedRow;
const claimRow = (entityId: string) =>
  ({ entityId, spaceId: 'space', types: [{ id: CLAIM_TYPE_ID }] }) as unknown as ExploreFeedRow;

const kind = (over: Partial<React.ComponentProps<typeof ProfileActivitySection>['kinds'][number]> = {}) => ({
  key: 'debates',
  label: 'Debates',
  rows: [row('d1')],
  total: 10,
  isLoading: false,
  href: '/space/s/debates',
  seeAllLabel: 'See all debates',
  ...over,
});

const rect = (width: number, height: number): DOMRect => ({
  x: 0,
  y: 0,
  top: 0,
  right: width,
  bottom: height,
  left: 0,
  width,
  height,
  toJSON: () => ({}),
});

/**
 * A 390×600 mobile viewport sitting 400px down a synthetic profile page.
 *
 * Includes a `ResizeObserver`, which JSDOM has none of. Without one the hook takes its
 * no-observer path and never attaches the scroll listener — so anything asserted about scrolling
 * passed for the wrong reason, whatever the code did.
 */
function mockMobileActivityGeometry(pageHeightWithoutActivity: number) {
  const resizeCallbacks = new Map<Element, () => void>();
  class TestResizeObserver {
    private readonly callback: ResizeObserverCallback;
    private readonly elements = new Set<Element>();

    constructor(callback: ResizeObserverCallback) {
      this.callback = callback;
    }
    observe(element: Element) {
      this.elements.add(element);
      resizeCallbacks.set(element, () => this.callback([], this as unknown as ResizeObserver));
    }
    unobserve(element: Element) {
      this.elements.delete(element);
      resizeCallbacks.delete(element);
    }
    disconnect() {
      for (const element of this.elements) resizeCallbacks.delete(element);
      this.elements.clear();
    }
  }
  vi.stubGlobal('ResizeObserver', TestResizeObserver);

  const sectionHeight = { debates: 500, claims: 250 };

  const originalRect = HTMLElement.prototype.getBoundingClientRect;
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    if ('activitySection' in this.dataset) {
      const debatesSelected =
        this.querySelector<HTMLButtonElement>('button[aria-pressed="true"]')?.textContent?.includes('Debates');
      return rect(390, debatesSelected ? sectionHeight.debates : sectionHeight.claims);
    }

    if ('activityScrollReserve' in this.dataset) {
      return rect(390, Number.parseFloat(this.style.height) || 0);
    }

    return originalRect.call(this);
  });

  const scroll: { y: number; moveAfterFirstRead?: number } = { y: 400 };
  let reads = 0;
  vi.spyOn(window, 'scrollY', 'get').mockImplementation(() => {
    reads += 1;
    if (scroll.moveAfterFirstRead !== undefined && reads > 1) return scroll.moveAfterFirstRead;
    return scroll.y;
  });
  const viewport = { height: 600 };
  vi.spyOn(window, 'innerHeight', 'get').mockImplementation(() => viewport.height);

  const page = { withoutActivity: pageHeightWithoutActivity };
  vi.spyOn(document.documentElement, 'scrollHeight', 'get').mockImplementation(() => {
    const section = document.querySelector<HTMLElement>('[data-activity-section]');
    const reserve = document.querySelector<HTMLElement>('[data-activity-scroll-reserve]');
    return (
      page.withoutActivity +
      (section?.getBoundingClientRect().height ?? 0) +
      (reserve?.getBoundingClientRect().height ?? 0)
    );
  });

  // Moves the mocked position, the way a real one does. Mocked as a no-op it silently turned
  // every "and then the reader is back at 400" into a page still sitting where it was, which is
  // how a viewport resize could lose the reader with the tests all passing.
  const scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(((_x: number, y: number) => {
    scroll.y = y;
  }) as typeof window.scrollTo);

  return {
    scrollTo,
    // Stands in for the browser moving the reader: there is no real layout here to clamp a scroll
    // position, and the recovery path exists for exactly that case.
    scroll,
    // And for the claim cards growing as their queries land, which is the other way the sizing
    // path runs after a switch. Move `sectionHeight` first; the observer reads it.
    sectionResized: () => {
      const section = document.querySelector('[data-activity-section]');
      if (section) resizeCallbacks.get(section)?.();
    },
    sectionHeight,
    // The viewport, which a phone changes on its own as its chrome collapses, and the rest of the
    // page, which goes on loading after the switch.
    viewport,
    page,
  };
}

/**
 * The card with both kinds, and the reserve element the tests below assert on.
 *
 * Every reserve test wants the same two kinds — a tall Debates view and a short Claims one — since
 * what they are about is the switch between them, not what is in either.
 */
function renderActivity() {
  const { container } = render(
    <ProfileActivitySection kinds={[kind(), kind({ key: 'claims', label: 'Claims', rows: [row('c1')] })]} />
  );

  return { reserve: container.querySelector<HTMLElement>('[data-activity-scroll-reserve]') };
}

/**
 * Wait for the scroll listener to arm.
 *
 * It arms a frame after a swap, so the swap's own scroll events are not read as the reader moving —
 * a test that scrolls straight after a switch is testing the disarmed frame and nothing else.
 */
function armScrollListener() {
  return act(async () => {
    await new Promise(resolve => requestAnimationFrame(() => resolve(null)));
  });
}

/**
 * What the Activity card says when half of it did not arrive (GEO-2859).
 *
 * The two kinds are separate requests. Filtering on `rows.length > 0` alone made
 * a failed one indistinguishable from an empty one — so a failed Claims query
 * left the card showing Debates and no toggle at all, implying this person holds
 * no positions, while the rail beside it counted 208.
 */
describe('ProfileActivitySection', () => {
  beforeEach(() => activityMocks.unavailableDebateIds.clear());

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('renders nothing when both kinds are genuinely empty', () => {
    // Most accounts have never been in a debate; a heading over blank space
    // reads as a page that failed.
    const { container } = render(
      <ProfileActivitySection kinds={[kind({ rows: [] }), kind({ key: 'claims', label: 'Claims', rows: [] })]} />
    );

    expect(container).toBeEmptyDOMElement();
  });

  it('leaves out a kind that is empty but fine', () => {
    render(<ProfileActivitySection kinds={[kind(), kind({ key: 'claims', label: 'Claims', rows: [] })]} />);

    expect(screen.queryByRole('button', { name: /Claims/ })).not.toBeInTheDocument();
  });

  it('keeps a kind that failed, so half the record cannot vanish quietly', () => {
    render(
      <ProfileActivitySection kinds={[kind(), kind({ key: 'claims', label: 'Claims', rows: [], isError: true })]} />
    );

    expect(screen.getByRole('button', { name: /Claims/ })).toBeInTheDocument();
  });

  it('says so when the selected kind failed', () => {
    render(<ProfileActivitySection kinds={[kind({ rows: [], isError: true })]} />);

    expect(screen.getByText('Couldn’t load debates.')).toBeInTheDocument();
    expect(screen.queryByTestId('card')).not.toBeInTheDocument();
  });

  it('still shows the rows of a kind that failed only on a later page', () => {
    render(<ProfileActivitySection kinds={[kind({ isError: true })]} />);

    expect(screen.getAllByTestId('card')).toHaveLength(1);
  });

  it('autoplays only the first debate and transfers playback when another is clicked', () => {
    render(<ProfileActivitySection kinds={[kind({ rows: [row('d1'), row('d2')] })]} />);

    const cards = screen.getAllByTestId('card');
    expect(cards).toHaveLength(2);
    expect(cards[0]?.parentElement).toHaveClass('w-[min(260px,84cqw)]');

    const gate = screen.getByTestId('playback-gate');
    expect(gate).toHaveAttribute('data-allowed-id', 'd1');

    fireEvent.click(screen.getByRole('button', { name: 'd2' }));
    expect(gate).toHaveAttribute('data-allowed-id', 'd2');
  });

  it('assigns playback only to debate cards that mounted a playable player', () => {
    activityMocks.unavailableDebateIds.add('d1');
    render(<ProfileActivitySection kinds={[kind({ rows: [row('d1'), row('d2')] })]} />);

    expect(screen.getByTestId('playback-gate')).toHaveAttribute('data-allowed-id', 'd2');
  });

  it('keeps the current owner when an earlier debate becomes playable later', () => {
    activityMocks.unavailableDebateIds.add('d1');
    const props = { kinds: [kind({ rows: [row('d1'), row('d2')] })] };
    const view = render(<ProfileActivitySection {...props} />);
    const gate = screen.getByTestId('playback-gate');
    expect(gate).toHaveAttribute('data-allowed-id', 'd2');

    activityMocks.unavailableDebateIds.delete('d1');
    view.rerender(<ProfileActivitySection {...props} />);

    expect(gate).toHaveAttribute('data-allowed-id', 'd2');
  });

  it('reselects a visible debate when the requested player becomes unavailable', async () => {
    const props = { kinds: [kind({ rows: [row('d1'), row('d2'), row('d3')] })] };
    const view = render(<ProfileActivitySection {...props} />);
    const scroller = document.querySelector<HTMLElement>('.overflow-x-auto') as HTMLElement;
    const cards = screen.getAllByTestId('card').map(card => card.parentElement as HTMLElement);
    const gate = screen.getByTestId('playback-gate');
    const horizontalRect = (left: number, width: number): DOMRect => ({
      ...rect(width, 400),
      x: left,
      left,
      right: left + width,
      bottom: 400,
    });
    vi.spyOn(scroller, 'getBoundingClientRect').mockImplementation(() => horizontalRect(0, 536));
    const starts = [0, 276, 552];
    scroller.scrollLeft = 276;
    cards.forEach((card, index) => {
      vi.spyOn(card, 'getBoundingClientRect').mockImplementation(() =>
        horizontalRect(starts[index]! - scroller.scrollLeft, 260)
      );
    });

    fireEvent.click(screen.getByRole('button', { name: 'd3' }));
    expect(gate).toHaveAttribute('data-allowed-id', 'd3');

    // A failed refetch can replace the selected player's card with fallback content. The next
    // owner must come from what is visible now, not from the first mounted row in source order.
    activityMocks.unavailableDebateIds.add('d3');
    view.rerender(<ProfileActivitySection {...props} />);
    await act(async () => new Promise<void>(resolve => requestAnimationFrame(() => resolve())));
    expect(gate).toHaveAttribute('data-allowed-id', 'd2');

    // The stale request must be gone too: remounting d3 cannot reclaim ownership by itself.
    activityMocks.unavailableDebateIds.delete('d3');
    view.rerender(<ProfileActivitySection {...props} />);
    await act(async () => new Promise<void>(resolve => requestAnimationFrame(() => resolve())));
    expect(gate).toHaveAttribute('data-allowed-id', 'd2');
  });

  it('returns playback to the first debate after switching to another Activity collection', () => {
    render(
      <ProfileActivitySection
        kinds={[
          kind({ rows: [row('d1'), row('d2')] }),
          kind({ key: 'claims', label: 'Claims', rows: [claimRow('c1')] }),
        ]}
      />
    );

    const gate = screen.getByTestId('playback-gate');
    fireEvent.click(screen.getByRole('button', { name: 'd2' }));
    expect(gate).toHaveAttribute('data-allowed-id', 'd2');

    fireEvent.click(screen.getByRole('button', { name: /Claims/ }));
    fireEvent.click(screen.getByRole('button', { name: /Debates/ }));

    expect(screen.getByTestId('playback-gate')).toHaveAttribute('data-allowed-id', 'd1');
  });

  it('keeps Claim cards wide enough for side-by-side response buttons', () => {
    render(
      <ProfileActivitySection
        kinds={[kind({ key: 'claims', label: 'Claims', rows: [claimRow('c1'), claimRow('c2'), claimRow('c3')] })]}
      />
    );

    const cards = screen.getAllByTestId('card');
    expect(cards).toHaveLength(3);
    expect(cards.every(card => card.parentElement?.className.includes('w-[min(300px,84cqw)]'))).toBe(true);
  });

  it('offers left and right buttons to scroll one Activity card at a time', async () => {
    render(<ProfileActivitySection kinds={[kind({ rows: [row('d1'), row('d2'), row('d3')] })]} />);

    const scroller = document.querySelector<HTMLElement>('.overflow-x-auto') as HTMLElement;
    Object.defineProperty(scroller, 'scrollWidth', { configurable: true, value: 900 });
    Object.defineProperty(scroller, 'clientWidth', { configurable: true, value: 300 });
    Object.defineProperty(scroller, 'scrollBy', { configurable: true, value: vi.fn() });
    const horizontalRect = (left: number, width: number): DOMRect => ({
      ...rect(width, 400),
      x: left,
      left,
      right: left + width,
      bottom: 400,
    });
    vi.spyOn(scroller, 'getBoundingClientRect').mockImplementation(() => horizontalRect(0, 300));
    const cards = screen.getAllByTestId('card').map(card => card.parentElement as HTMLElement);
    const starts = [0, 276, 552];
    cards.forEach((card, index) => {
      vi.spyOn(card, 'getBoundingClientRect').mockImplementation(() =>
        horizontalRect(starts[index]! - scroller.scrollLeft, 260)
      );
    });
    fireEvent.scroll(scroller);
    await act(async () => new Promise<void>(resolve => requestAnimationFrame(() => resolve())));

    expect(screen.queryByRole('button', { name: 'Scroll activity left' })).toBeNull();
    const next = screen.getByRole('button', { name: 'Scroll activity right' });
    fireEvent.click(next);
    expect(scroller.scrollBy).toHaveBeenCalledWith({ left: 276, behavior: 'smooth' });

    scroller.scrollLeft = 300;
    fireEvent.scroll(scroller);
    await act(async () => new Promise<void>(resolve => requestAnimationFrame(() => resolve())));
    expect(screen.getByRole('button', { name: 'Scroll activity left' })).toBeInTheDocument();

    // The final card is fully visible here even though the trailing spacer means the rail itself
    // still has a few scrollable pixels left. Those pixels should not keep the arrow around.
    scroller.scrollLeft = 512;
    fireEvent.scroll(scroller);
    await act(async () => new Promise<void>(resolve => requestAnimationFrame(() => resolve())));
    expect(screen.queryByRole('button', { name: 'Scroll activity right' })).toBeNull();
  });

  it('hands autoplay to the next visible debate when the current one scrolls out', async () => {
    render(<ProfileActivitySection kinds={[kind({ rows: [row('d1'), row('d2'), row('d3')] })]} />);

    const scroller = document.querySelector<HTMLElement>('.overflow-x-auto');
    const cards = screen.getAllByTestId('card').map(card => card.parentElement as HTMLElement);
    const gate = screen.getByTestId('playback-gate');
    expect(scroller).not.toBeNull();

    const horizontalRect = (left: number, width: number): DOMRect => ({
      ...rect(width, 400),
      x: left,
      left,
      right: left + width,
      bottom: 400,
    });
    vi.spyOn(scroller as HTMLElement, 'getBoundingClientRect').mockImplementation(() => horizontalRect(0, 750));

    const starts = [0, 276, 552];
    cards.forEach((card, index) => {
      vi.spyOn(card, 'getBoundingClientRect').mockImplementation(() =>
        horizontalRect(starts[index]! - (scroller as HTMLElement).scrollLeft, 260)
      );
    });

    (scroller as HTMLElement).scrollLeft = 170;
    fireEvent.scroll(scroller as HTMLElement);
    await act(async () => new Promise<void>(resolve => requestAnimationFrame(() => resolve())));
    expect(gate).toHaveAttribute('data-allowed-id', 'd2');

    (scroller as HTMLElement).scrollLeft = 446;
    fireEvent.scroll(scroller as HTMLElement);
    await act(async () => new Promise<void>(resolve => requestAnimationFrame(() => resolve())));
    expect(gate).toHaveAttribute('data-allowed-id', 'd3');
  });

  it('hands autoplay off when two-dimensional visibility deactivates the current player', async () => {
    render(<ProfileActivitySection kinds={[kind({ rows: [row('d1'), row('d2')] })]} />);

    const scroller = document.querySelector<HTMLElement>('.overflow-x-auto') as HTMLElement;
    const cards = screen.getAllByTestId('card').map(card => card.parentElement as HTMLElement);
    const gate = screen.getByTestId('playback-gate');
    const railTop = { value: 0 };
    const visibleRect = (left: number, width: number): DOMRect => ({
      ...rect(width, 400),
      x: left,
      left,
      right: left + width,
      top: railTop.value,
      bottom: railTop.value + 400,
    });
    vi.spyOn(scroller, 'getBoundingClientRect').mockImplementation(() => visibleRect(0, 750));
    const starts = [0, 276];
    cards.forEach((card, index) => {
      vi.spyOn(card, 'getBoundingClientRect').mockImplementation(() =>
        visibleRect(starts[index]! - scroller.scrollLeft, 260)
      );
    });

    // At full height the first card is 60% visible horizontally, so it remains the owner.
    scroller.scrollLeft = 104;
    fireEvent.scroll(scroller);
    await act(async () => new Promise<void>(resolve => requestAnimationFrame(() => resolve())));
    expect(gate).toHaveAttribute('data-allowed-id', 'd1');

    // Once the rail is only 60% high in the viewport, the first card's visible area is 36%, below
    // the player's 40% deactivation edge. The fully wide second card is still 60% visible overall.
    railTop.value = -160;
    fireEvent.scroll(window);
    await act(async () => new Promise<void>(resolve => requestAnimationFrame(() => resolve())));
    expect(gate).toHaveAttribute('data-allowed-id', 'd2');
  });

  it('draws a dash rather than a zero when the count could not be read', () => {
    render(
      <ProfileActivitySection kinds={[kind({ isCountUnavailable: true }), kind({ key: 'claims', label: 'Claims' })]} />
    );

    expect(screen.getByRole('button', { name: /Debates/ })).toHaveTextContent('—');
  });

  it('sends See all to the tab bar rather than the top of the page', () => {
    render(
      <ProfileActivitySection
        kinds={[
          kind(),
          kind({ key: 'claims', label: 'Claims', href: '/space/s/positions', seeAllLabel: 'See all claims' }),
        ]}
      />
    );

    // Without the fragment the reader lands at the top of the profile — a screenful of cover,
    // avatar, name, roles and bio — rather than on the list they clicked for.
    expect(screen.getByRole('link', { name: /See all debates/ })).toHaveAttribute(
      'href',
      '/space/s/debates#space-tabs'
    );

    fireEvent.click(screen.getByRole('button', { name: /Claims/ }));

    expect(screen.getByRole('link', { name: /See all claims/ })).toHaveAttribute(
      'href',
      '/space/s/positions#space-tabs'
    );
  });

  it('reserves the lost mobile document height while switching between kinds', () => {
    mockMobileActivityGeometry(600);

    const { reserve } = renderActivity();

    expect(reserve).toHaveStyle({ height: '0px' });

    fireEvent.click(screen.getByRole('button', { name: /Claims/ }));
    expect(reserve).toHaveStyle({ height: '150px' });

    fireEvent.click(screen.getByRole('button', { name: /Debates/ }));
    expect(reserve).toHaveStyle({ height: '0px' });

    fireEvent.click(screen.getByRole('button', { name: /Claims/ }));
    expect(reserve).toHaveStyle({ height: '150px' });
  });

  /**
   * The reserve has to be *displayed* on the screens it exists for, which is the one thing the tests
   * above could not see: they mock geometry, JSDOM applies no Tailwind, and so a reserve that the
   * browser was hiding still measured and asserted perfectly while doing nothing on a real phone.
   *
   * The breakpoints here are desktop-first — `md` is `@media (max-width: 767px)`, see styles.css — so
   * `md:hidden` hides an element *on mobile*. This element carried exactly that, which made the whole
   * mechanism inert on the only viewports it was written for (GEO-2974). Asserting the class is
   * crude, but it is the only trace of the mistake that survives into JSDOM.
   */
  it('keeps the reserve displayed at the mobile breakpoint, where it is the only thing holding the page', () => {
    mockMobileActivityGeometry(600);

    const { reserve } = renderActivity();

    // `md:hidden` would switch it off below 768px, which is every phone.
    expect(reserve?.className).not.toMatch(/(^|\s)md:hidden(\s|$)/);
    // And it has to be on at that width rather than merely not off.
    expect(reserve?.className).toMatch(/(^|\s)md:block(\s|$)/);
  });

  /**
   * Susan Winter's profile, which is where this was reported: an Activity card with nothing below it,
   * so the document barely exceeds the viewport and the card's own height is the entire scroll range.
   * Switching to the shorter view takes more height out of the page than the page has to spare.
   */
  it('holds the whole missing range on a profile with nothing below Activity', () => {
    // 40px of page besides the card: a name and an avatar, no sections after it.
    mockMobileActivityGeometry(40);

    const { reserve } = renderActivity();

    // Nothing to hold before a switch: the page is however tall it is.
    expect(reserve).toHaveStyle({ height: '0px' });

    fireEvent.click(screen.getByRole('button', { name: /Claims/ }));

    // Claims: 40 + 250 = 290 natural, and the reader's viewport bottom is at 1000.
    // That it is also allowed to render at this width is the test above.
    expect(reserve).toHaveStyle({ height: '710px' });
  });

  /**
   * The reserve is in the document a frame before React swaps the view, but the gallery can paint
   * empty while its queries land, and a document shorter than the reserve can cover takes the reader
   * with it. Where that happens they are put back, before the browser paints.
   */
  it('puts the reader back when a shrink beat the reserve to it', () => {
    const { scroll, scrollTo } = mockMobileActivityGeometry(600);

    renderActivity();

    // The switch reads the position once on the way in; by the time the effect looks again the
    // browser has moved the reader, which is the ordering this recovery exists for.
    scroll.moveAfterFirstRead = 150;
    fireEvent.click(screen.getByRole('button', { name: /Claims/ }));

    expect(scrollTo).toHaveBeenCalledWith(0, 400);
  });

  /**
   * The reader has to be able to scroll afterwards. Sizing the reserve and correcting the position
   * were the same function once, and that function ran on every scroll — so scrolling down, which
   * leaves the held position where it was, corrected the reader straight back to it. The page read
   * as refusing to move (GEO-2974).
   */
  it('lets the reader scroll down after a switch', async () => {
    const { scroll, scrollTo } = mockMobileActivityGeometry(600);

    renderActivity();
    fireEvent.click(screen.getByRole('button', { name: /Claims/ }));
    scrollTo.mockClear();

    await armScrollListener();

    scroll.y = 700;
    fireEvent.scroll(window);

    expect(scrollTo).not.toHaveBeenCalled();
  });

  it('stops holding height the reader has scrolled back above', async () => {
    const { scroll } = mockMobileActivityGeometry(600);
    const { reserve } = renderActivity();

    fireEvent.click(screen.getByRole('button', { name: /Claims/ }));
    expect(reserve).toHaveStyle({ height: '150px' });

    await armScrollListener();

    // Back up to the top: nothing below the viewport needs holding any more.
    scroll.y = 0;
    fireEvent.scroll(window);

    expect(reserve).toHaveStyle({ height: '0px' });
  });

  /**
   * A phone changes its own viewport height: the browser chrome collapses as the reader scrolls and
   * comes back when they stop, with nothing on the page moving. The held height is measured against
   * that viewport, so a taller one needs more below it — and before this was watched, the reader
   * could be clamped upward by exactly the height of a hidden URL bar.
   */
  it('re-sizes the reserve when the viewport height changes', () => {
    const { viewport } = mockMobileActivityGeometry(600);
    const { reserve } = renderActivity();

    fireEvent.click(screen.getByRole('button', { name: /Claims/ }));
    expect(reserve).toHaveStyle({ height: '150px' });

    // 600 → 700 of viewport. Held at 400, the page now has to reach 1100 rather than 1000, against
    // a natural 850.
    viewport.height = 700;
    fireEvent.resize(window);

    expect(reserve).toHaveStyle({ height: '250px' });
  });

  /**
   * The section is not the only thing on the page that moves after a switch. A cover image landing
   * above Activity changes the document height without changing the section at all, so a natural
   * height remembered from the switch is wrong — and wrong in the direction that leaves the reader
   * scrolling into space the page no longer needs.
   */
  it('measures the rest of the page rather than remembering it', () => {
    const { page, sectionHeight, sectionResized } = mockMobileActivityGeometry(600);
    const { reserve } = renderActivity();

    fireEvent.click(screen.getByRole('button', { name: /Claims/ }));
    expect(reserve).toHaveStyle({ height: '150px' });

    // The cards grow, and the cover lands above them in the same frame.
    page.withoutActivity = 700;
    sectionHeight.claims = 300;
    act(() => {
      sectionResized();
    });

    // 700 + 300 reaches the reader's 1000 exactly. Carried from the switch instead, the page above
    // is still believed to be 600 and 100px would be held for no one.
    expect(reserve).toHaveStyle({ height: '0px' });
  });

  /**
   * A growing viewport moves the reader before this hook hears about it, and by construction rather
   * than by chance: while the reserve holds anything it sizes the document so `holdY` is exactly the
   * furthest the page can scroll, so 100px more viewport is 100px less maximum, every time. Sizing
   * the reserve back up returns the range but not the reader.
   */
  it('puts the reader back when a growing viewport clamps them', () => {
    const { scroll, viewport, scrollTo } = mockMobileActivityGeometry(600);
    const { reserve } = renderActivity();

    fireEvent.click(screen.getByRole('button', { name: /Claims/ }));
    expect(reserve).toHaveStyle({ height: '150px' });
    scrollTo.mockClear();

    // The URL bar hides. The document is 1000 tall, so the furthest it can scroll drops from 400 to
    // 300 and the browser takes the reader with it before the resize handler runs.
    viewport.height = 700;
    scroll.y = 300;
    fireEvent.resize(window);

    expect(reserve).toHaveStyle({ height: '250px' });
    expect(scrollTo).toHaveBeenCalledWith(0, 400);

    // And the clamp arrives as a scroll event afterwards. Read as the reader moving up it would
    // lower the hold to 300 and shrink the reserve to 150, undoing the restore that just happened.
    fireEvent.scroll(window);
    expect(reserve).toHaveStyle({ height: '250px' });
  });

  /**
   * A viewport that shrinks comes back. On iOS the URL bar returning takes height away and hiding
   * it again gives the height back, so a shrink that happens to need nothing held must not retire
   * the swap — there would be nothing left to rebuild the reserve when the height returns, and the
   * reader would be clamped by the difference.
   */
  it('keeps holding across a viewport that shrinks and grows back', () => {
    const { viewport } = mockMobileActivityGeometry(600);
    const { reserve } = renderActivity();

    fireEvent.click(screen.getByRole('button', { name: /Claims/ }));
    expect(reserve).toHaveStyle({ height: '150px' });

    // The URL bar comes back, far enough that 400 + 450 is exactly the natural 850 and nothing
    // needs holding — which is a fact about this instant, not about the switch being over.
    viewport.height = 450;
    fireEvent.resize(window);
    expect(reserve).toHaveStyle({ height: '0px' });

    // It hides again.
    viewport.height = 700;
    fireEvent.resize(window);
    expect(reserve).toHaveStyle({ height: '250px' });
  });

  /**
   * The swap is over once the page can hold the reader without help, and it has to actually end.
   * Left armed, `holdY` outlives the switch it belongs to: a shrink long afterwards would size a
   * reserve from a position the reader left, and hand them a screen of blank space to scroll into.
   */
  it('stops holding once the page is tall enough on its own', () => {
    const { sectionHeight, sectionResized } = mockMobileActivityGeometry(600);
    const { reserve } = renderActivity();

    fireEvent.click(screen.getByRole('button', { name: /Claims/ }));
    expect(reserve).toHaveStyle({ height: '150px' });

    // The claim cards finish loading, and the page is long enough on its own.
    sectionHeight.claims = 500;
    act(() => {
      sectionResized();
    });
    expect(reserve).toHaveStyle({ height: '0px' });

    // Whatever shrinks the section after that is not this switch's business.
    sectionHeight.claims = 250;
    act(() => {
      sectionResized();
    });
    expect(reserve).toHaveStyle({ height: '0px' });
  });

  /**
   * The other caller of the sizing path. A claim card grows when its queries land, which resizes
   * the section — and resizing the reserve is the whole response to that. Moving the reader is not,
   * wherever they have got to by then: the correction belongs to the swap that asked for it.
   */
  it('leaves the reader alone when the cards grow after a switch', async () => {
    const { scroll, sectionResized, scrollTo } = mockMobileActivityGeometry(600);

    renderActivity();
    fireEvent.click(screen.getByRole('button', { name: /Claims/ }));
    scrollTo.mockClear();
    await armScrollListener();

    scroll.y = 700;
    act(() => {
      sectionResized();
    });

    expect(scrollTo).not.toHaveBeenCalled();
  });

  it('leaves the reader alone when the reserve did its job', () => {
    const { scrollTo } = mockMobileActivityGeometry(600);

    renderActivity();

    fireEvent.click(screen.getByRole('button', { name: /Claims/ }));

    expect(scrollTo).not.toHaveBeenCalled();
  });

  it('adds no reserve when content below Activity already preserves the scroll range', () => {
    mockMobileActivityGeometry(900);

    const { reserve } = renderActivity();

    fireEvent.click(screen.getByRole('button', { name: /Claims/ }));

    expect(reserve).toHaveStyle({ height: '0px' });
  });
});
