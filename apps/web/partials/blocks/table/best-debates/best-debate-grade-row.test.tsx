import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Grade } from '~/core/blocks/ranking/ranking-grades';

import { BestDebateGradeRow } from './best-debate-grade-row';
import type { BestDebatesGrading } from './best-debate-grading';

const mocks = vi.hoisted(() => ({
  pushDown: {
    isPushedDown: false,
    isVoteKnown: true,
    state: { status: 'idle' } as { status: string },
    undo: vi.fn(),
  },
}));

vi.mock('~/core/blocks/ranking/use-push-down', () => ({ usePushDown: () => mocks.pushDown }));

const DEBATE = 'd1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1';

function grading(
  overrides: Partial<BestDebatesGrading> = {},
  state: { grade?: Grade | null; place?: number | null } = {}
) {
  return {
    ready: true,
    needsTierLines: false,
    gradeOf: () => state.grade ?? null,
    placeOf: () => state.place ?? null,
    isSaving: () => false,
    grade: vi.fn(),
    remove: vi.fn(),
    downRank: vi.fn(),
    ...overrides,
  } satisfies BestDebatesGrading;
}

const pill = (name: string) => screen.getByRole('radio', { name });

beforeEach(() => {
  mocks.pushDown.isPushedDown = false;
  mocks.pushDown.isVoteKnown = true;
  mocks.pushDown.state = { status: 'idle' };
  mocks.pushDown.undo.mockReset();
});
afterEach(cleanup);

describe('BestDebateGradeRow (GEO-3729)', () => {
  it('grades a debate that isn’t in the ranking in one tap', () => {
    const g = grading();
    render(<BestDebateGradeRow entityId={DEBATE} grading={g} />);
    expect(screen.getByText('Grade')).toBeInTheDocument();
    fireEvent.click(pill('B'));
    expect(g.grade).toHaveBeenCalledWith(DEBATE, 'B');
  });

  it('shows the grade and where it landed, with Remove', () => {
    const g = grading({}, { grade: 'B', place: 31 });
    render(<BestDebateGradeRow entityId={DEBATE} grading={g} />);
    expect(pill('B')).toHaveAttribute('aria-checked', 'true');
    expect(pill('A')).toHaveAttribute('aria-checked', 'false');
    expect(screen.getByText('#31 in your ranking')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }));
    expect(g.remove).toHaveBeenCalledWith(DEBATE);
  });

  it('never removes on a second tap of the selected grade', () => {
    const g = grading({}, { grade: 'A', place: 3 });
    render(<BestDebateGradeRow entityId={DEBATE} grading={g} />);
    fireEvent.click(pill('A'));
    expect(g.grade).not.toHaveBeenCalled();
    expect(g.remove).not.toHaveBeenCalled();
  });

  it('regrades to another tier', () => {
    const g = grading({}, { grade: 'A', place: 3 });
    render(<BestDebateGradeRow entityId={DEBATE} grading={g} />);
    fireEvent.click(pill('C'));
    expect(g.grade).toHaveBeenCalledWith(DEBATE, 'C');
  });

  it('D is Down rank', () => {
    const g = grading();
    render(<BestDebateGradeRow entityId={DEBATE} grading={g} />);
    expect(pill('D, Down rank')).toHaveAttribute('title', 'Down rank');
    fireEvent.click(pill('D, Down rank'));
    expect(g.downRank).toHaveBeenCalledWith(DEBATE);
  });

  it('waits for the ranker’s vote before D', () => {
    mocks.pushDown.isVoteKnown = false;
    render(<BestDebateGradeRow entityId={DEBATE} grading={grading()} />);
    expect(pill('D, Down rank')).toBeDisabled();
  });

  it('shows Down ranked with Undo once down ranked', () => {
    mocks.pushDown.isPushedDown = true;
    render(<BestDebateGradeRow entityId={DEBATE} grading={grading()} />);
    expect(pill('D, Down rank')).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByText('Down ranked')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(mocks.pushDown.undo).toHaveBeenCalled();
  });

  it('puts the debate back where the surface can, on Undo', () => {
    mocks.pushDown.isPushedDown = true;
    const undoDownRank = vi.fn();
    render(<BestDebateGradeRow entityId={DEBATE} grading={grading({ undoDownRank })} />);
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(undoDownRank).toHaveBeenCalledWith(DEBATE);
  });

  it('shows Saving… while the grade publishes, with the grades held', () => {
    render(
      <BestDebateGradeRow entityId={DEBATE} grading={grading({ isSaving: () => true }, { grade: 'A', place: 1 })} />
    );
    expect(screen.getByText('Saving…')).toBeInTheDocument();
    expect(pill('B')).toBeDisabled();
  });

  it('asks for the tier lines first on a ranking with no grades', () => {
    const onGradeYourRanking = vi.fn();
    const g = grading({ needsTierLines: true, onGradeYourRanking });
    render(<BestDebateGradeRow entityId={DEBATE} grading={g} />);
    expect(pill('A')).toBeDisabled();
    expect(pill('C')).toBeDisabled();
    expect(screen.getByText('Grade your ranking first')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Grade it' }));
    expect(onGradeYourRanking).toHaveBeenCalled();
  });

  it('waits for the ranking to load', () => {
    render(<BestDebateGradeRow entityId={DEBATE} grading={grading({ ready: false })} />);
    expect(pill('A')).toBeDisabled();
    expect(pill('D, Down rank')).toBeDisabled();
  });

  it('labels each pill for analytics', () => {
    render(<BestDebateGradeRow entityId={DEBATE} grading={grading()} />);
    expect(pill('A')).toHaveAttribute('data-geo-analytics-label', 'grade_a');
    expect(pill('D, Down rank')).toHaveAttribute('data-geo-analytics-label', 'grade_d');
  });
});
