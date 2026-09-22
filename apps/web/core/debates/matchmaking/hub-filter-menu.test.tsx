import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

import * as React from 'react';

import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { HubMultiFilterMenu } from './hub-filter-menu';

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

beforeAll(() => {
  window.ResizeObserver = ResizeObserverStub as unknown as typeof ResizeObserver;
  // jsdom has no matchMedia, and the menu asks it whether a real keyboard is present before it
  // takes focus. Answered as a touch device so the tests drive the field explicitly.
  window.matchMedia = ((query: string) => ({
    matches: false,
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

  function renderTopicMenu(overrides?: { onToggle?: (value: string) => void; onClear?: () => void }) {
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

  it('offers no search field without the prop', async () => {
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

  it('offers no search field while the menu has no options to search', async () => {
    render(
      <HubMultiFilterMenu
        align="start"
        label="Any topic"
        options={[]}
        values={[]}
        onToggle={() => {}}
        onClear={() => {}}
        clearLabel="Any topic"
        searchPlaceholder="Search topics"
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Any topic' }));

    await waitFor(() => expect(screen.getAllByText('Any topic')).toHaveLength(2));
    expect(screen.queryByLabelText('Search topics')).not.toBeInTheDocument();
  });
});
