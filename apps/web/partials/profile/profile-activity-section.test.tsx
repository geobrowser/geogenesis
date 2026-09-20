import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';

import * as React from 'react';

import { afterEach, describe, expect, it, vi } from 'vitest';

import type { ExploreFeedRow } from '~/core/explore/explore-card-item';

import { ProfileActivitySection } from './profile-activity-section';

// The gallery is local to the file under test, so its dependencies are mocked
// rather than the gallery itself.
vi.mock('~/partials/explore/explore-feed-card', () => ({
  ExploreFeedCard: ({ item }: { item: { entityId: string } }) => <div data-testid="card">{item.entityId}</div>,
}));

vi.mock('./gallery-claim-card', () => ({
  GalleryClaimCard: ({ row }: { row: ExploreFeedRow }) => <div data-testid="card">{row.entityId}</div>,
}));

vi.mock('~/core/hooks/use-space-labels', () => ({
  useSpaceLabels: () => ({ labelsById: new Map(), isLoading: false }),
  spaceLabel: () => undefined,
}));

vi.mock('~/core/debates/debate-playback-gate', () => ({
  DebatePlaybackGate: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('~/design-system/prefetch-link', () => ({
  PrefetchLink: ({ children, href }: React.ComponentPropsWithoutRef<'a'>) => <a href={href}>{children}</a>,
}));

// `types` is read to tell a claim from a debate, so a row without it is not a
// row this component can draw.
const row = (entityId: string) => ({ entityId, spaceId: 'space', types: [] }) as unknown as ExploreFeedRow;

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
  class TestResizeObserver {
    constructor(private readonly callback: ResizeObserverCallback) {}
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  vi.stubGlobal('ResizeObserver', TestResizeObserver);

  const originalRect = HTMLElement.prototype.getBoundingClientRect;
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    if ('activitySection' in this.dataset) {
      const debatesSelected =
        this.querySelector<HTMLButtonElement>('button[aria-pressed="true"]')?.textContent?.includes('Debates');
      return rect(390, debatesSelected ? 500 : 250);
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
  vi.spyOn(window, 'innerHeight', 'get').mockReturnValue(600);
  vi.spyOn(document.documentElement, 'scrollHeight', 'get').mockImplementation(() => {
    const section = document.querySelector<HTMLElement>('[data-activity-section]');
    const reserve = document.querySelector<HTMLElement>('[data-activity-scroll-reserve]');
    return (
      pageHeightWithoutActivity +
      (section?.getBoundingClientRect().height ?? 0) +
      (reserve?.getBoundingClientRect().height ?? 0)
    );
  });

  // Returned so a test can stand in for the browser moving the reader — there is no real layout
  // here to clamp a scroll position, and the recovery path exists for exactly that case.
  return scroll;
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

    const { container } = render(
      <ProfileActivitySection kinds={[kind(), kind({ key: 'claims', label: 'Claims', rows: [row('c1')] })]} />
    );
    const reserve = container.querySelector<HTMLElement>('[data-activity-scroll-reserve]');

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

    const { container } = render(
      <ProfileActivitySection kinds={[kind(), kind({ key: 'claims', label: 'Claims', rows: [row('c1')] })]} />
    );
    const reserve = container.querySelector<HTMLElement>('[data-activity-scroll-reserve]');

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

    const { container } = render(
      <ProfileActivitySection kinds={[kind(), kind({ key: 'claims', label: 'Claims', rows: [row('c1')] })]} />
    );
    const reserve = container.querySelector<HTMLElement>('[data-activity-scroll-reserve]');

    // Nothing to hold before a switch: the page is however tall it is.
    expect(reserve).toHaveStyle({ height: '0px' });

    fireEvent.click(screen.getByRole('button', { name: /Claims/ }));

    // Claims: 40 + 250 = 290 natural, and the reader's viewport bottom is at 1000.
    expect(reserve).toHaveStyle({ height: '710px' });

    // And it has to be on screen to mean anything. On this profile the reserve is the only thing
    // between the reader and the top of the page, so a height it is not allowed to render is the
    // same as no fix at all — which is how this shipped once already.
    expect(reserve?.className).toMatch(/(^|\s)md:block(\s|$)/);
    expect(reserve?.className).not.toMatch(/(^|\s)md:hidden(\s|$)/);
  });

  /**
   * The reserve is in the document a frame before React swaps the view, but the gallery can paint
   * empty while its queries land, and a document shorter than the reserve can cover takes the reader
   * with it. Where that happens they are put back, before the browser paints.
   */
  it('puts the reader back when a shrink beat the reserve to it', () => {
    const scroll = mockMobileActivityGeometry(600);
    const scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => {});

    render(<ProfileActivitySection kinds={[kind(), kind({ key: 'claims', label: 'Claims', rows: [row('c1')] })]} />);

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
    const scroll = mockMobileActivityGeometry(600);
    const scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => {});

    render(<ProfileActivitySection kinds={[kind(), kind({ key: 'claims', label: 'Claims', rows: [row('c1')] })]} />);
    fireEvent.click(screen.getByRole('button', { name: /Claims/ }));
    scrollTo.mockClear();

    // The scroll listener is armed a frame after the swap, so that the swap's own events are not
    // read as the reader moving. Wait for it, then scroll down.
    await act(async () => {
      await new Promise(resolve => requestAnimationFrame(() => resolve(null)));
    });

    scroll.y = 700;
    fireEvent.scroll(window);

    expect(scrollTo).not.toHaveBeenCalled();
  });

  it('stops holding height the reader has scrolled back above', async () => {
    const scroll = mockMobileActivityGeometry(600);
    const { container } = render(
      <ProfileActivitySection kinds={[kind(), kind({ key: 'claims', label: 'Claims', rows: [row('c1')] })]} />
    );
    const reserve = container.querySelector<HTMLElement>('[data-activity-scroll-reserve]');

    fireEvent.click(screen.getByRole('button', { name: /Claims/ }));
    expect(reserve).toHaveStyle({ height: '150px' });

    await act(async () => {
      await new Promise(resolve => requestAnimationFrame(() => resolve(null)));
    });

    // Back up to the top: nothing below the viewport needs holding any more.
    scroll.y = 0;
    fireEvent.scroll(window);

    expect(reserve).toHaveStyle({ height: '0px' });
  });

  it('leaves the reader alone when the reserve did its job', () => {
    mockMobileActivityGeometry(600);
    const scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => {});

    render(<ProfileActivitySection kinds={[kind(), kind({ key: 'claims', label: 'Claims', rows: [row('c1')] })]} />);

    fireEvent.click(screen.getByRole('button', { name: /Claims/ }));

    expect(scrollTo).not.toHaveBeenCalled();
  });

  it('adds no reserve when content below Activity already preserves the scroll range', () => {
    mockMobileActivityGeometry(900);

    const { container } = render(
      <ProfileActivitySection kinds={[kind(), kind({ key: 'claims', label: 'Claims', rows: [row('c1')] })]} />
    );
    const reserve = container.querySelector<HTMLElement>('[data-activity-scroll-reserve]');

    fireEvent.click(screen.getByRole('button', { name: /Claims/ }));

    expect(reserve).toHaveStyle({ height: '0px' });
  });
});
