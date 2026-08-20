import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { DailyActivityTask } from '~/core/space/daily-activities';

const mocks = vi.hoisted(() => ({
  rankingComplete: new Map<string, { complete: boolean; isLoading: boolean }>(),
  uploadComplete: false,
}));

vi.mock('~/core/space/use-space-daily-activities', () => ({
  useRankingDailyActivityComplete: (blockId: string) =>
    mocks.rankingComplete.get(blockId) ?? { complete: false, isLoading: true },
  useDailyUploadActivityComplete: () => mocks.uploadComplete,
}));

const { SpaceDailyActivitiesSection } = await import('./space-daily-activities-section');

const rankingTask: DailyActivityTask = {
  kind: 'ranking',
  id: 'ranking:block-1',
  blockId: 'block-1',
  title: 'Top albums',
  description: 'Rank them',
};

const toggle = () => screen.getByRole('button', { name: /Collapse daily activities|Expand daily activities/ });
const taskList = () => screen.queryByRole('list');

function renderSection(tasks: DailyActivityTask[] = [rankingTask]) {
  return render(<SpaceDailyActivitiesSection spaceId="space-1" tasks={tasks} />);
}

beforeEach(() => {
  mocks.rankingComplete = new Map();
  mocks.uploadComplete = false;
});

afterEach(cleanup);

describe('SpaceDailyActivitiesSection', () => {
  it('stays open while a task is outstanding', () => {
    mocks.rankingComplete.set('block-1', { complete: false, isLoading: false });
    renderSection();

    expect(taskList()).toBeInTheDocument();
    expect(toggle()).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('0% complete')).toBeInTheDocument();
  });

  // Folded away rather than removed: "100% complete" is the point, and the next reset makes it
  // worth opening again.
  it('folds down to its heading once every task is done, without disappearing', () => {
    mocks.rankingComplete.set('block-1', { complete: true, isLoading: false });
    renderSection();

    expect(screen.getByRole('heading', { name: 'Daily activities' })).toBeInTheDocument();
    expect(screen.getByText('100% complete')).toBeInTheDocument();
    expect(taskList()).not.toBeInTheDocument();
    expect(toggle()).toHaveAttribute('aria-expanded', 'false');
  });

  it('opens a finished checklist when asked, and stays open', () => {
    mocks.rankingComplete.set('block-1', { complete: true, isLoading: false });
    const view = renderSection();
    expect(taskList()).not.toBeInTheDocument();

    fireEvent.click(toggle());

    expect(taskList()).toBeInTheDocument();
    view.rerender(<SpaceDailyActivitiesSection spaceId="space-1" tasks={[rankingTask]} />);
    expect(taskList()).toBeInTheDocument();
  });

  // The watchers sit outside the collapse, so a folded checklist still notices the reset.
  it('keeps watching completion while folded', () => {
    mocks.rankingComplete.set('block-1', { complete: true, isLoading: false });
    const view = renderSection();
    expect(taskList()).not.toBeInTheDocument();

    mocks.rankingComplete.set('block-1', { complete: false, isLoading: false });
    view.rerender(<SpaceDailyActivitiesSection spaceId="space-1" tasks={[rankingTask]} />);

    expect(taskList()).toBeInTheDocument();
    expect(screen.getByText('0% complete')).toBeInTheDocument();
  });

  it('stays open while completion is still unknown', () => {
    mocks.rankingComplete.set('block-1', { complete: true, isLoading: true });
    renderSection();

    expect(screen.getByText('Loading…')).toBeInTheDocument();
    expect(taskList()).toBeInTheDocument();
  });
});
