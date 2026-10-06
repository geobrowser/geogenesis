import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { SPACE_PILLS_BEFORE_MORE, SpaceFilterPills } from './space-filter-pills';

const labels = vi.hoisted(() => ({ loading: false }));

vi.mock('~/core/hooks/use-space-labels', () => ({
  useSpaceLabels: (ids: string[]) =>
    labels.loading
      ? { labelsById: new Map(), isLoading: true }
      : { labelsById: new Map(ids.map(id => [id, { name: `Name ${id}`, image: null }])), isLoading: false },
  spaceLabel: (labels: Map<string, unknown>, id: string) => labels.get(id) ?? null,
}));

afterEach(() => {
  cleanup();
  labels.loading = false;
});

const spaces = (n: number) => Array.from({ length: n }, (_, index) => ({ id: `s${index}`, count: n - index }));

function renderPills(props: Partial<React.ComponentProps<typeof SpaceFilterPills>> = {}) {
  const onSpaceToggle = vi.fn();
  const onSpacesClear = vi.fn();
  render(
    <SpaceFilterPills
      analyticsSurface="calendar"
      facetSpaces={spaces(3)}
      spaceIds={[]}
      onSpaceToggle={onSpaceToggle}
      onSpacesClear={onSpacesClear}
      {...props}
    />
  );
  return { onSpaceToggle, onSpacesClear };
}

const pillNames = () =>
  screen
    .getAllByRole('button')
    .filter(button => button.hasAttribute('aria-pressed'))
    .map(button => button.textContent);

describe('SpaceFilterPills', () => {
  it('shows every space as a pill beside All spaces, with its count', () => {
    renderPills();

    expect(screen.getByRole('button', { name: 'All spaces', pressed: true })).toBeInTheDocument();
    expect(pillNames()).toEqual(['All spaces', 'Name s03', 'Name s12', 'Name s21']);
  });

  it('toggles a space, and All spaces clears', () => {
    const { onSpaceToggle, onSpacesClear } = renderPills({ spaceIds: ['s1'] });

    expect(screen.getByRole('button', { name: /Name s1/, pressed: true })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'All spaces', pressed: false })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Name s0/ }));
    expect(onSpaceToggle).toHaveBeenCalledWith('s0');

    fireEvent.click(screen.getByRole('button', { name: 'All spaces' }));
    expect(onSpacesClear).toHaveBeenCalledTimes(1);
  });

  it('does not clear an already-empty selection again', () => {
    const { onSpacesClear } = renderPills();

    fireEvent.click(screen.getByRole('button', { name: 'All spaces' }));
    expect(onSpacesClear).not.toHaveBeenCalled();
  });

  // Pinning the picked pill to the front would move it out from under the pointer.
  it('keeps count order when a space is picked', () => {
    renderPills({ spaceIds: ['s2'] });

    expect(pillNames()).toEqual(['All spaces', 'Name s03', 'Name s12', 'Name s21']);
  });

  it('folds spaces past the cap behind "N more", but never a picked one', () => {
    const total = SPACE_PILLS_BEFORE_MORE + 3;
    const picked = `s${total - 1}`;
    renderPills({ facetSpaces: spaces(total), spaceIds: [picked] });

    // The cap, plus the picked space past it, plus All spaces.
    expect(pillNames()).toHaveLength(SPACE_PILLS_BEFORE_MORE + 2);
    expect(screen.getByRole('button', { name: new RegExp(`Name ${picked}`), pressed: true })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '2 more' }));
    expect(pillNames()).toHaveLength(total + 1);
    expect(screen.getByRole('button', { name: 'Fewer' })).toBeInTheDocument();
  });

  it('draws nothing once settled with no spaces, and skeletons while loading', () => {
    const { container, rerender } = render(
      <SpaceFilterPills
        analyticsSurface="calendar"
        facetSpaces={[]}
        spaceIds={[]}
        onSpaceToggle={() => {}}
        onSpacesClear={() => {}}
        loading
      />
    );
    expect(container.firstChild).not.toBeNull();
    expect(screen.queryByRole('group')).toBeNull();

    rerender(
      <SpaceFilterPills
        analyticsSurface="calendar"
        facetSpaces={[]}
        spaceIds={[]}
        onSpaceToggle={() => {}}
        onSpacesClear={() => {}}
      />
    );
    expect(container.firstChild).toBeNull();
  });

  it('labels presses for the analytics autocapture', () => {
    renderPills();

    expect(screen.getByRole('button', { name: /Name s0/ })).toHaveAttribute(
      'data-geo-analytics-label',
      'Debate calendar Space pill'
    );
    expect(screen.getByRole('button', { name: 'All spaces' })).toHaveAttribute(
      'data-geo-analytics-intent',
      'filter_debate_calendar'
    );
  });

  // Placeholder-width names made a full row wrap to two lines for a moment.
  it('keeps the one-line skeleton up until the names arrive', () => {
    labels.loading = true;
    const { container } = render(
      <SpaceFilterPills
        analyticsSurface="calendar"
        facetSpaces={spaces(6)}
        spaceIds={[]}
        onSpaceToggle={() => {}}
        onSpacesClear={() => {}}
      />
    );

    expect(screen.queryByRole('group')).toBeNull();
    expect(container.firstChild).not.toHaveClass('flex-wrap');
  });
});
