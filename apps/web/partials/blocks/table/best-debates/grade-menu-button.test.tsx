import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { type BestDebatesGrading, BestDebatesGradingContext } from './best-debate-grading';
import { GradeMenuButton } from './grade-menu-button';

const DEBATE = 'd1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1';

function grading(overrides: Partial<BestDebatesGrading> = {}): BestDebatesGrading {
  return {
    ready: true,
    needsTierLines: false,
    gradeOf: () => null,
    placeOf: () => null,
    isSaving: () => false,
    grade: vi.fn(),
    reorder: vi.fn(),
    remove: vi.fn(),
    downRank: vi.fn(),
    ...overrides,
  };
}

function renderWith(value: BestDebatesGrading | null) {
  const onRowClick = vi.fn();
  render(
    <BestDebatesGradingContext.Provider value={value}>
      <div onClick={onRowClick}>
        <GradeMenuButton entityId={DEBATE} name="Cats are better than dogs" />
      </div>
    </BestDebatesGradingContext.Provider>
  );
  return { onRowClick };
}

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
vi.stubGlobal('ResizeObserver', ResizeObserverStub);

afterEach(cleanup);

describe('GradeMenuButton (GEO-3729)', () => {
  it('shows nothing to someone who can’t rank', () => {
    renderWith(null);
    expect(screen.queryByRole('button', { name: /Grade/ })).toBeNull();
  });

  it('grades from the row like the popup, recorded as from the list, without opening the row', () => {
    const g = grading();
    const { onRowClick } = renderWith(g);
    fireEvent.click(screen.getByRole('button', { name: 'Grade Cats are better than dogs' }));
    fireEvent.click(screen.getByRole('button', { name: 'B' }));
    expect(g.grade).toHaveBeenCalledWith(DEBATE, 'B', 'list');
    expect(onRowClick).not.toHaveBeenCalled();
  });

  it('D is Down rank', () => {
    const g = grading();
    renderWith(g);
    fireEvent.click(screen.getByRole('button', { name: 'Grade Cats are better than dogs' }));
    fireEvent.click(screen.getByRole('button', { name: /Down rank/ }));
    expect(g.downRank).toHaveBeenCalledWith(DEBATE);
  });

  it('asks for the tier lines first on a ranking with no grades', () => {
    renderWith(grading({ needsTierLines: true }));
    fireEvent.click(screen.getByRole('button', { name: 'Grade Cats are better than dogs' }));
    expect(screen.getByText('Grade your ranking first')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'A' })).toBeDisabled();
    expect(screen.getByRole('button', { name: /Down rank/ })).toBeEnabled();
  });

  it('offers Grade it from the menu on a ranking with no grades', () => {
    const onGradeYourRanking = vi.fn();
    renderWith(grading({ needsTierLines: true, onGradeYourRanking }));
    fireEvent.click(screen.getByRole('button', { name: 'Grade Cats are better than dogs' }));
    fireEvent.click(screen.getByRole('button', { name: 'Grade it' }));
    expect(onGradeYourRanking).toHaveBeenCalled();
  });

  it('can’t be dragged with a row', () => {
    renderWith(grading());
    expect(screen.getByRole('button', { name: 'Grade Cats are better than dogs' })).toHaveAttribute(
      'draggable',
      'false'
    );
  });
});
