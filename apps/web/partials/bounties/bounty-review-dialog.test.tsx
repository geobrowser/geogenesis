import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

import * as React from 'react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { GroupedSubmission } from '~/core/bounties/group-submissions';
import { MEDIUM_DIFFICULTY_ID } from '~/core/bounties/ontology';
import type { BoardBounty } from '~/core/bounties/types';
import type { ReviewOutcome, ReviewSubmitInput } from '~/core/bounties/use-review-payout-actions';

import { BountyReviewDialog, validateReviewForm } from './bounty-review-dialog';

afterEach(cleanup);

const bounty: BoardBounty = {
  id: 'b',
  spaceId: 's',
  name: 'Bounty',
  description: null,
  budget: 1000,
  difficulty: 'Medium',
  difficultyId: MEDIUM_DIFFICULTY_ID,
  status: null,
  statusId: null,
  deadline: null,
  skills: [],
  maintainers: [],
  allocatedIds: [],
  interestedCount: 0,
  updatedAt: null,
  isFeatured: false,
  contributors: [],
};

const segment = {
  submissionKey: 'k',
  creatorEntityId: 'alice',
  firstProposalId: 'p1',
  proposalIds: ['p1', 'p2'],
  lastActiveAt: new Date('2026-08-01T00:00:00Z'),
};
const submission: GroupedSubmission = {
  ...segment,
  creatorName: 'Alice',
  status: 'in-progress',
  proposals: [],
  canReviewAndPayout: true,
};

const full = { completeness: 5, accuracy: 4, skill: 4, effort: 5 };

const config = vi.hoisted(() => ({ payoutEnabled: true }));
vi.mock('~/core/bounties/config', () => ({
  get PAYOUT_AUTHORING_ENABLED() {
    return config.payoutEnabled;
  },
}));

describe('validateReviewForm', () => {
  it('requires every rating, and a positive whole-point payout when one is entered', () => {
    expect(validateReviewForm({ stars: { ...full, skill: 0 }, pass: true, comment: '', payoutAmount: '10' })).toMatch(
      /Rate every/
    );
    // Blank payout is allowed on a pass (review saved without paying) — curator-app's rule.
    expect(validateReviewForm({ stars: full, pass: true, comment: '', payoutAmount: '' })).toBeNull();
    expect(validateReviewForm({ stars: full, pass: true, comment: '', payoutAmount: '0' })).toMatch(/whole number/);
    expect(validateReviewForm({ stars: full, pass: true, comment: '', payoutAmount: '10.5' })).toMatch(/whole number/);
    expect(validateReviewForm({ stars: full, pass: true, comment: '', payoutAmount: '200' })).toBeNull();
    // Failing reviews need no payout.
    expect(validateReviewForm({ stars: full, pass: false, comment: '', payoutAmount: '' })).toBeNull();
  });
});

describe('BountyReviewDialog', () => {
  beforeEach(() => {
    config.payoutEnabled = true;
  });

  type OnSubmit = (input: ReviewSubmitInput) => Promise<ReviewOutcome>;
  function setup(
    onSubmit: ReturnType<typeof vi.fn<OnSubmit>> = vi.fn<OnSubmit>(async () => ({ status: 'saved-and-paid' }))
  ) {
    const onOpenChange = vi.fn();
    render(
      <BountyReviewDialog
        bounty={bounty}
        submission={submission}
        open
        onOpenChange={onOpenChange}
        onSubmit={onSubmit}
        busy={false}
      />
    );
    return { onSubmit, onOpenChange };
  }

  function rateAll() {
    for (const label of ['Completeness', 'Accuracy', 'Skill', 'Effort']) {
      const group = screen.getByRole('radiogroup', { name: `${label} rating` });
      fireEvent.click(group.querySelector('[aria-label="5 stars"]')!);
    }
  }

  it('shows the suggested payout range and blocks submit until the form is valid', async () => {
    const { onSubmit } = setup();
    expect(screen.getByText(/Suggested range 200 – 1,000/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Save review' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/Rate every/);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('hides the payout field and explains why while payout authoring is disabled', async () => {
    config.payoutEnabled = false;
    const { onSubmit } = setup();
    rateAll();
    expect(screen.queryByText('Payout (points)')).not.toBeInTheDocument();
    expect(screen.getByTestId('payout-authoring-note')).toHaveTextContent(/issued from the curator app/);
    fireEvent.click(screen.getByRole('button', { name: 'Save review' }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit.mock.calls[0][0]).toMatchObject({ pass: true, payoutAmount: null });
  });

  it('saves a passing review without a payout when the amount is left blank', async () => {
    const { onSubmit } = setup();
    rateAll();
    // No amount entered → the button reads "Save review" and payoutAmount is null.
    fireEvent.click(screen.getByRole('button', { name: 'Save review' }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit.mock.calls[0][0]).toMatchObject({ pass: true, payoutAmount: null });
  });

  it('submits normalized ratings, pass, comment and payout, then closes', async () => {
    const { onSubmit, onOpenChange } = setup();
    rateAll();
    fireEvent.change(screen.getByPlaceholderText('200 – 1,000'), { target: { value: '300' } });
    fireEvent.change(screen.getByPlaceholderText('Optional feedback for the curator'), { target: { value: 'Nice' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save review & pay' }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit.mock.calls[0][0]).toMatchObject({
      submission,
      stars: { completeness: 1, accuracy: 1, skill: 1, effort: 1 },
      pass: true,
      comment: 'Nice',
      payoutAmount: 300,
    });
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });

  it('hides payout for a failing review and keeps the dialog open on failure', async () => {
    const onSubmit = vi.fn<OnSubmit>(async () => ({ status: 'failed', reason: 'Publish failed' }));
    const { onOpenChange } = setup(onSubmit);
    fireEvent.click(screen.getByRole('button', { name: 'Fail' }));
    expect(screen.queryByText('Payout (points)')).not.toBeInTheDocument();
    rateAll();
    fireEvent.click(screen.getByRole('button', { name: 'Save review' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Publish failed');
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
    expect(onSubmit.mock.calls[0][0]).toMatchObject({ pass: false, payoutAmount: null });
  });

  it('lists existing reviews, and is read-only when the viewer cannot review', () => {
    const review = {
      id: 'rev-1',
      spaceId: 'aaaa0000000000000000000000000001',
      proposalIds: ['p1', 'p2'],
      pass: false,
      comment: 'Incomplete',
      ratings: { completeness: 0.4, accuracy: 0.6, skill: 0.6, effort: 0.8 },
      createdAt: new Date('2026-08-18T00:00:00Z'),
    };
    render(
      <BountyReviewDialog
        bounty={bounty}
        submission={submission}
        open
        onOpenChange={vi.fn()}
        onSubmit={vi.fn<OnSubmit>(async () => ({ status: 'saved' }))}
        busy={false}
        existingReviews={[review]}
        reviewerNames={new Map([['aaaa0000000000000000000000000001', 'Alice']])}
        canReview={false}
      />
    );
    const list = screen.getByTestId('existing-reviews');
    expect(list).toHaveTextContent('Fail');
    expect(list).toHaveTextContent('Completeness 2/5');
    expect(list).toHaveTextContent('by Alice');
    expect(list).toHaveTextContent('Incomplete');
    // No form: no rating radios, no save button — just Close.
    expect(screen.queryByRole('radiogroup')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Save review/ })).not.toBeInTheDocument();
    // The header X and the footer Close both close the dialog.
    expect(screen.getAllByRole('button', { name: 'Close' })).toHaveLength(2);
  });
});
