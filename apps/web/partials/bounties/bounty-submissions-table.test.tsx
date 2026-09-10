import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';

import * as React from 'react';

import { afterEach, describe, expect, it, vi } from 'vitest';

import type { GroupedSubmission } from '~/core/bounties/group-submissions';

import { BountySubmissionsTable } from './bounty-submissions-table';

vi.mock('~/design-system/prefetch-link', () => ({
  PrefetchLink: ({ children, href, ...rest }: React.ComponentPropsWithoutRef<'a'>) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

afterEach(cleanup);

const segment = {
  submissionKey: 'k1',
  creatorEntityId: 'alice',
  firstProposalId: 'p1',
  proposalIds: ['p1'],
  lastActiveAt: new Date('2026-08-01T00:00:00Z'),
};

function row(overrides: Partial<GroupedSubmission> = {}): GroupedSubmission {
  return {
    ...segment,
    creatorName: 'Alice',
    status: 'in-progress',
    proposals: [
      {
        entityId: 'p1',
        name: 'Add aspirin',
        spaceId: 'dao',
        createdAt: new Date('2026-08-01T00:00:00Z'),
        status: 'Accepted',
      },
    ],
    canReviewAndPayout: false,
    ...overrides,
  };
}

const handlers = () => ({
  onOpenReview: vi.fn(),
  onRefresh: vi.fn(),
});

describe('BountySubmissionsTable', () => {
  it('renders rows with status chips and expandable proposals', () => {
    render(
      <BountySubmissionsTable
        spaceId="dao"
        submissions={[row(), row({ submissionKey: 'k2', status: 'paid', payoutAmount: 250 })]}
        isLoading={false}
        isError={false}
        busyKey={null}
        {...handlers()}
      />
    );
    const rows = screen.getAllByTestId('submission-row');
    expect(rows).toHaveLength(2);
    expect(within(rows[0]).getByText('In progress')).toBeInTheDocument();
    expect(within(rows[1]).getByText('Paid')).toBeInTheDocument();
    expect(within(rows[1]).getByText('250')).toBeInTheDocument();
    fireEvent.click(within(rows[0]).getByRole('button', { name: '1 proposal' }));
    expect(screen.getByText('Add aspirin')).toHaveAttribute('href', '/space/dao/governance?proposalId=p1');
  });

  it('offers Review only on rows the viewer can review', () => {
    const h = handlers();
    render(
      <BountySubmissionsTable
        spaceId="dao"
        submissions={[row(), row({ submissionKey: 'k2', canReviewAndPayout: true })]}
        isLoading={false}
        isError={false}
        busyKey={null}
        {...h}
      />
    );
    // Only the reviewable row gets a button.
    expect(screen.getAllByRole('button', { name: 'Review' })).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: 'Review' }));
    expect(h.onOpenReview).toHaveBeenCalledWith(expect.objectContaining({ submissionKey: 'k2' }));
  });

  it('pages at ten rows', () => {
    render(
      <BountySubmissionsTable
        spaceId="dao"
        submissions={Array.from({ length: 12 }, (_, i) => row({ submissionKey: `k${i}`, creatorName: `Curator ${i}` }))}
        isLoading={false}
        isError={false}
        busyKey={null}
        {...handlers()}
      />
    );
    expect(screen.getAllByTestId('submission-row')).toHaveLength(10);
    expect(screen.getByTestId('table-pager')).toHaveTextContent('1–10 of 12');
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getAllByTestId('submission-row')).toHaveLength(2);
  });

  it('shows the rejected status chip', () => {
    render(
      <BountySubmissionsTable
        spaceId="dao"
        submissions={[row({ status: 'rejected' })]}
        isLoading={false}
        isError={false}
        busyKey={null}
        {...handlers()}
      />
    );
    expect(screen.getByText('Rejected')).toBeInTheDocument();
  });

  it('shows a review indicator on reviewed rows and a Reviews button for non-editors', () => {
    const h = handlers();
    const review = {
      id: 'rev-1',
      spaceId: 'reviewer',
      proposalIds: ['p1'],
      pass: true,
      comment: 'Nice',
      ratings: { completeness: 1, accuracy: 0.8, skill: 0.8, effort: 1 },
      createdAt: new Date('2026-08-18T00:00:00Z'),
    };
    render(
      <BountySubmissionsTable
        spaceId="dao"
        submissions={[row()]}
        reviewsByKey={new Map([['k1', [review]]])}
        isLoading={false}
        isError={false}
        busyKey={null}
        {...h}
      />
    );
    expect(screen.getByTestId('review-indicator')).toHaveTextContent('Reviewed · Pass · ★ 4.5');
    fireEvent.click(screen.getByRole('button', { name: 'Reviews (1)' }));
    expect(h.onOpenReview).toHaveBeenCalled();
  });
});
