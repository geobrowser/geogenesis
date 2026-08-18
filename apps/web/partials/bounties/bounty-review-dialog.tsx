'use client';

import * as Dialog from '@radix-ui/react-dialog';

import * as React from 'react';

import type { GroupedSubmission } from '~/core/bounties/group-submissions';
import { formatPayoutRange, formatPoints, payoutRange } from '~/core/bounties/payout';
import { type ReviewRatings, starsToRating } from '~/core/bounties/review-ops';
import type { BoardBounty } from '~/core/bounties/types';
import type { ReviewOutcome, ReviewSubmitInput } from '~/core/bounties/use-review-payout-actions';

import { Button, SquareButton } from '~/design-system/button';
import { Close } from '~/design-system/icons/close';
import { Text } from '~/design-system/text';

const RATING_LABELS: Array<{ key: keyof ReviewRatings; label: string }> = [
  { key: 'completeness', label: 'Completeness' },
  { key: 'accuracy', label: 'Accuracy' },
  { key: 'skill', label: 'Skill' },
  { key: 'effort', label: 'Effort' },
];

type Stars = Record<keyof ReviewRatings, number>;

export type ReviewFormState = {
  stars: Stars;
  pass: boolean;
  comment: string;
  payoutAmount: string;
};

/**
 * First problem with the form, or null. Ratings must all be set. The payout is
 * optional (curator-app's rule): blank ⇒ the review is saved with no payout and
 * the submission is not marked paid; if entered it must be a positive whole
 * number within the space's available points.
 */
export function validateReviewForm(state: ReviewFormState, availablePoints: number | null): string | null {
  if (RATING_LABELS.some(({ key }) => state.stars[key] < 1)) return 'Rate every category before submitting.';
  if (!state.pass) return null;
  const trimmed = state.payoutAmount.trim();
  if (!trimmed) return null;
  const amount = Number(trimmed);
  if (!Number.isInteger(amount) || amount <= 0) {
    return 'Payout must be a positive whole number of points — or leave it blank to save the review without a payout.';
  }
  if (availablePoints != null && amount > availablePoints) {
    return `Payout exceeds the space's available points (${formatPoints(availablePoints)}).`;
  }
  return null;
}

/** The payout the form will submit: null when blank (save review only). */
export function payoutFromForm(state: ReviewFormState): number | null {
  if (!state.pass) return null;
  const trimmed = state.payoutAmount.trim();
  return trimmed ? Number(trimmed) : null;
}

type Props = {
  bounty: BoardBounty;
  submission: GroupedSubmission | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (input: ReviewSubmitInput) => Promise<ReviewOutcome>;
  busy: boolean;
  /** Space points available for payout, when known. */
  availablePoints: number | null;
};

const initialState = (): ReviewFormState => ({
  stars: { completeness: 0, accuracy: 0, skill: 0, effort: 0 },
  pass: true,
  comment: '',
  payoutAmount: '',
});

export function BountyReviewDialog({ bounty, submission, open, onOpenChange, onSubmit, busy, availablePoints }: Props) {
  const [state, setState] = React.useState<ReviewFormState>(initialState);
  const [error, setError] = React.useState<string | null>(null);

  // Reset per submission.
  React.useEffect(() => {
    if (open) {
      setState(initialState());
      setError(null);
    }
  }, [open, submission?.submissionKey]);

  const range = payoutRange(bounty.budget, bounty.difficultyId);
  const hasBudget = range != null && range.max > 0;
  const willPay = payoutFromForm(state) != null;

  const submit = async () => {
    if (!submission) return;
    const problem = validateReviewForm(state, availablePoints);
    if (problem) return setError(problem);
    setError(null);
    const outcome = await onSubmit({
      submission,
      stars: {
        completeness: starsToRating(state.stars.completeness),
        accuracy: starsToRating(state.stars.accuracy),
        skill: starsToRating(state.stars.skill),
        effort: starsToRating(state.stars.effort),
      },
      pass: state.pass,
      comment: state.comment,
      payoutAmount: payoutFromForm(state),
    });
    if (outcome.status === 'failed') {
      setError(outcome.reason);
      return;
    }
    onOpenChange(false);
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-100 bg-text/20" />
        <Dialog.Content className="fixed inset-0 z-101 flex items-start justify-center overflow-y-auto p-4 focus:outline-hidden">
          <div
            className="mt-20 flex w-full max-w-[560px] flex-col gap-4 rounded-lg bg-white p-5 shadow-dropdown"
            data-testid="bounty-review-dialog"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <Dialog.Title asChild>
                  <Text as="h2" variant="mediumTitle">
                    Review submission
                  </Text>
                </Dialog.Title>
                <Text variant="metadata" color="grey-04">
                  {submission?.creatorName ?? 'Curator'} · {submission?.proposalIds.length ?? 0} proposal
                  {submission?.proposalIds.length === 1 ? '' : 's'}
                </Text>
              </div>
              <Dialog.Close asChild>
                <SquareButton icon={<Close />} aria-label="Close" />
              </Dialog.Close>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {RATING_LABELS.map(({ key, label }) => (
                <div key={key} className="flex flex-col gap-1">
                  <Text variant="metadataMedium">{label}</Text>
                  <StarInput
                    value={state.stars[key]}
                    onChange={value => setState(s => ({ ...s, stars: { ...s.stars, [key]: value } }))}
                    label={label}
                  />
                </div>
              ))}
            </div>

            <div className="flex flex-col gap-1">
              <Text variant="metadataMedium">Outcome</Text>
              <div className="flex gap-2">
                <Button
                  variant={state.pass ? 'primary' : 'secondary'}
                  onClick={() => setState(s => ({ ...s, pass: true }))}
                >
                  Pass
                </Button>
                <Button
                  variant={!state.pass ? 'primary' : 'secondary'}
                  onClick={() => setState(s => ({ ...s, pass: false }))}
                >
                  Fail
                </Button>
              </div>
            </div>

            {state.pass ? (
              <label className="flex flex-col gap-1">
                <Text variant="metadataMedium">Payout (points)</Text>
                <input
                  type="number"
                  inputMode="numeric"
                  min={1}
                  step={1}
                  value={state.payoutAmount}
                  onChange={e => setState(s => ({ ...s, payoutAmount: e.target.value }))}
                  placeholder={hasBudget ? (formatPayoutRange(range) ?? '') : 'Optional'}
                  className="w-full rounded-md border border-grey-02 px-3 py-2 text-metadata"
                />
                <Text variant="footnote" color="grey-04">
                  {hasBudget ? `Suggested range ${formatPayoutRange(range)}. ` : ''}
                  {availablePoints != null ? `${formatPoints(availablePoints)} points available. ` : ''}
                  Leave blank to save the review without a payout.
                </Text>
              </label>
            ) : null}

            <label className="flex flex-col gap-1">
              <Text variant="metadataMedium">Comment</Text>
              <textarea
                value={state.comment}
                onChange={e => setState(s => ({ ...s, comment: e.target.value }))}
                rows={3}
                placeholder="Optional feedback for the curator"
                className="w-full rounded-md border border-grey-02 px-3 py-2 text-metadata"
              />
            </label>

            {error ? (
              <p role="alert" className="text-metadata text-red-01">
                {error}
              </p>
            ) : null}

            <div className="flex justify-end gap-2">
              <Dialog.Close asChild>
                <Button variant="secondary">Cancel</Button>
              </Dialog.Close>
              <Button variant="primary" disabled={busy || !submission} onClick={() => void submit()}>
                {busy ? 'Saving…' : willPay ? 'Save review & pay' : 'Save review'}
              </Button>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function StarInput({ value, onChange, label }: { value: number; onChange: (value: number) => void; label: string }) {
  return (
    <div role="radiogroup" aria-label={`${label} rating`} className="flex gap-1">
      {[1, 2, 3, 4, 5].map(star => (
        <button
          key={star}
          type="button"
          role="radio"
          aria-checked={value === star}
          aria-label={`${star} star${star === 1 ? '' : 's'}`}
          onClick={() => onChange(star)}
          className={star <= value ? 'text-purple' : 'text-grey-03 hover:text-grey-04'}
        >
          ★
        </button>
      ))}
    </div>
  );
}
