import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

import * as React from 'react';

import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { HubMultiFilterMenu } from './hub-filter-menu';

/** Callbacks handed to {@link ResizeObserverStub}, so a test can say "the list just grew". */
const resizeCallbacks: ResizeObserverCallback[] = [];

class ResizeObserverStub {
  constructor(callback: ResizeObserverCallback) {
    resizeCallbacks.push(callback);
  }
  observe() {}
  unobserve() {}
  disconnect() {}
}

function fireResize() {
  for (const callback of [...resizeCallbacks]) callback([], {} as ResizeObserver);
}

/**
 * jsdom lays nothing out, so both sides of the menu's overflow test are 0 and it would never offer
 * the search field. Defined on the prototype rather than on the viewport, which a test has no
 * handle on — the shared `Menu` owns that node — and nothing else in these menus is measured.
 *
 * A plain `defineProperty` reading a variable rather than a spy, so a test can change the answer
 * mid-run without re-spying a getter that is already mocked.
 */
let listOverflows = false;
let hasFinePointer = false;
const VIEWPORT_CLIENT_HEIGHT = 400;

function stubOverflow(overflowing: boolean) {
  listOverflows = overflowing;
}

beforeAll(() => {
  window.ResizeObserver = ResizeObserverStub as unknown as typeof ResizeObserver;
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', {
    configurable: true,
    get: () => VIEWPORT_CLIENT_HEIGHT,
  });
  Object.defineProperty(HTMLElement.prototype, 'scrollHeight', {
    configurable: true,
    get: () => (listOverflows ? VIEWPORT_CLIENT_HEIGHT * 2 : VIEWPORT_CLIENT_HEIGHT),
  });
  // jsdom has no matchMedia, and the menu asks it whether a real keyboard is present before it
  // takes focus. Answered as a touch device by default, so only the tests that are about focus
  // have to think about it.
  window.matchMedia = ((query: string) => ({
    matches: query.includes('pointer: fine') ? hasFinePointer : false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  listOverflows = false;
  hasFinePointer = false;
  resizeCallbacks.length = 0;
});

describe('HubMultiFilterMenu placement', () => {
  function mockRightSideTrigger() {
    vi.spyOn(HTMLButtonElement.prototype, 'getBoundingClientRect').mockReturnValue({
      bottom: 140,
      height: 40,
      left: 800,
      right: 900,
      top: 100,
      width: 100,
      x: 800,
      y: 100,
      toJSON: () => {},
    });
  }

  function renderMenu(align?: 'start') {
    render(
      <HubMultiFilterMenu
        align={align}
        label="Any space"
        options={[{ value: 'space-1', label: 'Crypto', count: 4 }]}
        values={[]}
        onToggle={() => {}}
        onClear={() => {}}
        clearLabel="Any space"
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Any space' }));
  }

  it('accepts a start override for a right-docked panel', async () => {
    mockRightSideTrigger();
    renderMenu('start');

    await waitFor(() =>
      expect(screen.getByText('Crypto').closest('[data-align]')).toHaveAttribute('data-align', 'start')
    );
  });

  it('keeps adaptive placement when no override is provided', async () => {
    mockRightSideTrigger();
    renderMenu();

    await waitFor(() =>
      expect(screen.getByText('Crypto').closest('[data-align]')).toHaveAttribute('data-align', 'end')
    );
  });
});

describe('HubMultiFilterMenu search', () => {
  const TOPICS = [
    { value: 'topic-1', label: 'Climate policy', count: 12 },
    { value: 'topic-2', label: 'Monetary policy', count: 7 },
    { value: 'topic-3', label: 'Artificial intelligence', count: 3 },
  ];

  /** Opens a menu whose list still fits, and hands back a row to interact with. */
  async function openMenuAndFindRow() {
    render(
      <HubMultiFilterMenu
        align="start"
        label="Any topic"
        options={TOPICS}
        values={[]}
        onToggle={() => {}}
        onClear={() => {}}
        clearLabel="Any topic"
        searchPlaceholder="Search topics"
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Any topic' }));
    await waitFor(() => expect(screen.getByText('Climate policy')).toBeInTheDocument());
    return screen.getByText('Climate policy').closest('button')!;
  }

  function renderTopicMenu(overrides?: {
    onToggle?: (value: string) => void;
    onClear?: () => void;
    overflowing?: boolean;
  }) {
    stubOverflow(overrides?.overflowing ?? true);
    render(
      <HubMultiFilterMenu
        align="start"
        label="Any topic"
        options={TOPICS}
        values={[]}
        onToggle={overrides?.onToggle ?? (() => {})}
        onClear={overrides?.onClear ?? (() => {})}
        clearLabel="Any topic"
        searchPlaceholder="Search topics"
        searchEmptyLabel="No topics match"
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Any topic' }));
    return screen.findByLabelText('Search topics');
  }

  it('narrows the options to the query, case-insensitively', async () => {
    const field = await renderTopicMenu();

    fireEvent.change(field, { target: { value: 'POLICY' } });

    await waitFor(() => expect(screen.queryByText('Artificial intelligence')).not.toBeInTheDocument());
    expect(screen.getByText('Climate policy')).toBeInTheDocument();
    expect(screen.getByText('Monetary policy')).toBeInTheDocument();
  });

  it('matches anywhere in the name, not just its start', async () => {
    const field = await renderTopicMenu();

    fireEvent.change(field, { target: { value: 'intelligence' } });

    await waitFor(() => expect(screen.getByText('Artificial intelligence')).toBeInTheDocument());
    expect(screen.queryByText('Climate policy')).not.toBeInTheDocument();
  });

  it('says so when nothing matches, rather than showing an empty menu', async () => {
    const field = await renderTopicMenu();

    fireEvent.change(field, { target: { value: 'zzz' } });

    await waitFor(() => expect(screen.getByText('No topics match')).toBeInTheDocument());
  });

  it('announces an empty result without moving focus', async () => {
    const field = await renderTopicMenu();

    // The region is mounted before the message exists. A live region inserted at the same moment
    // as its text is the case screen readers are documented to miss.
    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('');

    fireEvent.change(field, { target: { value: 'zzz' } });

    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('No topics match'));
    // Announced, not focused: the viewer stays where they were typing.
    expect(screen.getByRole('status')).not.toHaveFocus();
  });

  it('hides the clear row while a query is live, and brings it back when the query is cleared', async () => {
    const field = await renderTopicMenu();

    // Two: the trigger pill and the clear row.
    expect(screen.getAllByText('Any topic')).toHaveLength(2);

    fireEvent.change(field, { target: { value: 'policy' } });
    await waitFor(() => expect(screen.getAllByText('Any topic')).toHaveLength(1));

    fireEvent.change(field, { target: { value: '' } });
    await waitFor(() => expect(screen.getAllByText('Any topic')).toHaveLength(2));
  });

  it('keeps the menu open when a filtered option is ticked', async () => {
    const onToggle = vi.fn();
    const field = await renderTopicMenu({ onToggle });

    fireEvent.change(field, { target: { value: 'climate' } });
    await waitFor(() => expect(screen.queryByText('Monetary policy')).not.toBeInTheDocument());

    fireEvent.click(screen.getByText('Climate policy'));

    expect(onToggle).toHaveBeenCalledWith('topic-1');
    expect(screen.getByLabelText('Search topics')).toBeInTheDocument();
  });

  it('forgets the query when the menu is closed and reopened', async () => {
    const field = await renderTopicMenu();

    fireEvent.change(field, { target: { value: 'climate' } });
    await waitFor(() => expect(screen.queryByText('Monetary policy')).not.toBeInTheDocument());

    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByLabelText('Search topics')).not.toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Any topic' }));

    await waitFor(() => expect(screen.getByText('Monetary policy')).toBeInTheDocument());
    expect(await screen.findByLabelText('Search topics')).toHaveValue('');
  });

  it('leaves focus alone for an activation that emits only a click', async () => {
    // Assistive technology and `HTMLElement.click()` activate a row without a pointer or key event
    // ever reaching it. The viewer is no less mid-pick for that, and the guard has to agree.
    hasFinePointer = true;
    const row = await openMenuAndFindRow();

    row.click();
    stubOverflow(true);
    act(fireResize);

    const field = await screen.findByLabelText('Search topics');
    // Long enough for the autofocus timer and its frame to have come and gone.
    await new Promise(resolve => setTimeout(resolve, 50));
    expect(field).not.toHaveFocus();
  });

  it('leaves focus alone while a row is still held down', async () => {
    // The press has landed and the release has not. A facet that widens in between would otherwise
    // put the field up and take focus out of the row under the viewer's finger.
    hasFinePointer = true;
    const row = await openMenuAndFindRow();

    fireEvent.pointerDown(row);
    stubOverflow(true);
    act(fireResize);

    const field = await screen.findByLabelText('Search topics');
    await new Promise(resolve => setTimeout(resolve, 50));
    expect(field).not.toHaveFocus();
  });

  it('leaves focus alone while the viewer is moving through the rows by keyboard', async () => {
    hasFinePointer = true;
    const row = await openMenuAndFindRow();

    fireEvent.keyDown(row, { key: 'Tab' });
    stubOverflow(true);
    act(fireResize);

    const field = await screen.findByLabelText('Search topics');
    await new Promise(resolve => setTimeout(resolve, 50));
    expect(field).not.toHaveFocus();
  });

  it('offers no search field without the prop', async () => {
    stubOverflow(true);
    render(
      <HubMultiFilterMenu
        align="start"
        label="Any space"
        options={[{ value: 'space-1', label: 'Crypto', count: 4 }]}
        values={[]}
        onToggle={() => {}}
        onClear={() => {}}
        clearLabel="Any space"
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Any space' }));

    await waitFor(() => expect(screen.getByText('Crypto')).toBeInTheDocument());
    expect(screen.queryByLabelText('Search topics')).not.toBeInTheDocument();
  });

  it('offers no search field when the options fit on one page', async () => {
    render(
      <HubMultiFilterMenu
        align="start"
        label="Any topic"
        options={TOPICS}
        values={[]}
        onToggle={() => {}}
        onClear={() => {}}
        clearLabel="Any topic"
        searchPlaceholder="Search topics"
      />
    );
    stubOverflow(false);

    fireEvent.click(screen.getByRole('button', { name: 'Any topic' }));

    await waitFor(() => expect(screen.getByText('Climate policy')).toBeInTheDocument());
    expect(screen.queryByLabelText('Search topics')).not.toBeInTheDocument();
  });

  it('offers the field when the list grows past the viewport after the menu is already open', async () => {
    render(
      <HubMultiFilterMenu
        align="start"
        label="Any topic"
        options={TOPICS}
        values={[]}
        onToggle={() => {}}
        onClear={() => {}}
        clearLabel="Any topic"
        searchPlaceholder="Search topics"
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Any topic' }));
    await waitFor(() => expect(screen.getByText('Climate policy')).toBeInTheDocument());
    expect(screen.queryByLabelText('Search topics')).not.toBeInTheDocument();

    // The facet lands, and the list now runs off the end.
    stubOverflow(true);
    act(fireResize);

    await waitFor(() => expect(screen.getByLabelText('Search topics')).toBeInTheDocument());
  });

  it('leaves the field unfocused on a touch device, popover autofocus included', async () => {
    const field = await renderTopicMenu();

    // Two separate things could focus this field, and the pointer check only governs one of them.
    //
    // Radix focuses the first tabbable descendant when the popover mounts, and it would take this
    // input if the input were there — it is not, because the field is downstream of a measurement
    // that cannot happen until the viewport node exists, which is a commit later. That is a real
    // guarantee but an easy one to lose, so this asserts the outcome rather than the mechanism: it
    // fails both if the pointer guard goes and if the field ever becomes present at mount.
    //
    // Long enough for Radix's mount focus and for the autofocus timer that declines to run.
    await new Promise(resolve => setTimeout(resolve, 50));
    expect(field).not.toHaveFocus();
  });

  it('declines to focus the field when the pointer kind cannot be established', async () => {
    // A runtime with no matchMedia cannot say whether a keyboard is present, and the two ways of
    // being wrong are not symmetric: guessing "desktop" throws a software keyboard over the list,
    // guessing "touch" costs a tap on a field that is already on screen.
    const saved = window.matchMedia;
    // @ts-expect-error -- modelling a runtime that does not have it at all.
    delete window.matchMedia;

    try {
      const field = await renderTopicMenu();
      await new Promise(resolve => setTimeout(resolve, 50));
      expect(field).not.toHaveFocus();
    } finally {
      window.matchMedia = saved;
    }
  });

  it('takes focus on open where there is a keyboard to type with', async () => {
    hasFinePointer = true;
    const field = await renderTopicMenu();

    await waitFor(() => expect(field).toHaveFocus());
  });

  it('leaves focus alone when the field only appears after the viewer has started picking', async () => {
    hasFinePointer = true;
    // Ticking a topic widens the co-occurrence facet, and the menu stays open for it.
    const row = await openMenuAndFindRow();
    fireEvent.pointerDown(row);
    fireEvent.click(row);
    stubOverflow(true);
    act(fireResize);

    const field = await screen.findByLabelText('Search topics');
    // Long enough for the autofocus timer and its frame to have come and gone.
    await new Promise(resolve => setTimeout(resolve, 50));
    expect(field).not.toHaveFocus();
  });

  it('keeps the field once shown, even when the query narrows the list back to a single page', async () => {
    const field = await renderTopicMenu();

    // The query trims the list back to something that fits, and the shrink is measured again.
    fireEvent.change(field, { target: { value: 'climate' } });
    await waitFor(() => expect(screen.queryByText('Monetary policy')).not.toBeInTheDocument());
    stubOverflow(false);
    act(fireResize);

    expect(screen.getByLabelText('Search topics')).toHaveValue('climate');
  });
});
