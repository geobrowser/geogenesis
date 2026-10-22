'use client';

import * as Dialog from '@radix-ui/react-dialog';

import * as React from 'react';

import { formatPoints } from '~/core/bounties/payout';
import type { DirectPayoutOutcome, PayoutRecipient, PendingCredit } from '~/core/bounties/use-direct-payout';

import { Button, SquareButton } from '~/design-system/button';
import { Close } from '~/design-system/icons/close';
import { Text } from '~/design-system/text';

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  bountyName: string;
  recipient: PayoutRecipient | null;
  recipientLabel: string;
  /** Spendable points in the bounty space; null while loading or unreadable. */
  balance: number | null;
  balanceLoading: boolean;
  /** Set when a payout was published but its ledger credit still has to go through. */
  pendingCredit: PendingCredit | null;
  busy: boolean;
  onPay: (amount: number) => Promise<DirectPayoutOutcome>;
  onRetryCredit: () => Promise<DirectPayoutOutcome>;
};

/** First problem with the amount, or null. */
export function validatePayoutAmount(raw: string, balance: number | null): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return 'Enter an amount.';
  const amount = Number(trimmed);
  if (!Number.isInteger(amount) || amount <= 0) return 'Amount must be a positive whole number of points.';
  if (balance != null && amount > balance) return `This space only has ${formatPoints(balance)} points.`;
  return null;
}

/**
 * Pays one allocated curator a chosen amount with no submission attached —
 * for bounties worked outside the bounty space.
 */
export function BountyPayDialog({
  open,
  onOpenChange,
  bountyName,
  recipient,
  recipientLabel,
  balance,
  balanceLoading,
  pendingCredit,
  busy,
  onPay,
  onRetryCredit,
}: Props) {
  const [amount, setAmount] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (open) {
      setAmount('');
      setError(null);
    }
  }, [open, recipient?.spaceId]);

  const handleOutcome = (outcome: DirectPayoutOutcome) => {
    if (outcome.status === 'paid') {
      onOpenChange(false);
    } else if (outcome.status === 'publish-failed') {
      setError('The payout could not be published. Nothing was paid.');
    } else {
      setError(`The payout was published, but crediting the points failed: ${outcome.message}`);
    }
  };

  const submit = async () => {
    if (pendingCredit) {
      handleOutcome(await onRetryCredit());
      return;
    }
    const problem = validatePayoutAmount(amount, balance);
    if (problem) {
      setError(problem);
      return;
    }
    setError(null);
    handleOutcome(await onPay(Number(amount.trim())));
  };

  return (
    <Dialog.Root
      open={open}
      onOpenChange={next => {
        // Closing mid-publish would hide the outcome of a points transfer.
        if (!busy) onOpenChange(next);
      }}
    >
      <Dialog.Portal>
        {/* Above the entity side panel (z-[200]), like the review dialog. The card is the
            Content, inside the Overlay, so a press on the backdrop dismisses. */}
        <Dialog.Overlay className="fixed inset-0 z-[201] flex items-start justify-center overflow-y-auto bg-text/20 p-4">
          <Dialog.Content
            className="mt-20 flex w-full max-w-[440px] flex-col gap-4 rounded-lg bg-white p-5 shadow-dropdown focus:outline-hidden"
            data-testid="bounty-pay-dialog"
            aria-describedby={undefined}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <Dialog.Title asChild>
                  <Text as="h2" variant="mediumTitle">
                    Pay {pendingCredit ? pendingCredit.recipient.name || recipientLabel : recipientLabel}
                  </Text>
                </Dialog.Title>
                <Text variant="metadata" color="grey-04">
                  {bountyName} · no submission needed
                </Text>
              </div>
              <Dialog.Close asChild>
                <SquareButton icon={<Close />} aria-label="Close" disabled={busy} />
              </Dialog.Close>
            </div>

            {pendingCredit ? (
              <Text variant="metadata">
                A payout of {formatPoints(pendingCredit.amount)} points was published, but the points have not been
                credited yet. Retry to finish it. This won&apos;t create a second payout.
              </Text>
            ) : (
              <label className="flex flex-col gap-1">
                <Text variant="metadataMedium">Amount (points)</Text>
                <input
                  type="number"
                  inputMode="numeric"
                  min={1}
                  step={1}
                  value={amount}
                  onChange={e => setAmount(e.target.value)}
                  disabled={busy}
                  className="w-full rounded-md border border-grey-02 px-3 py-2 text-metadata"
                />
                <Text variant="footnote" color="grey-04" data-testid="pay-balance">
                  {balanceLoading
                    ? 'Loading space balance…'
                    : balance != null
                      ? `Space balance: ${formatPoints(balance)} points`
                      : 'Space balance unavailable'}
                </Text>
              </label>
            )}

            {error ? (
              <p role="alert" className="text-metadata text-red-01">
                {error}
              </p>
            ) : null}

            <div className="flex justify-end gap-2">
              <Dialog.Close asChild>
                <Button variant="secondary" disabled={busy}>
                  Cancel
                </Button>
              </Dialog.Close>
              <Button variant="primary" disabled={busy || (!pendingCredit && !recipient)} onClick={() => void submit()}>
                {busy ? 'Paying…' : pendingCredit ? 'Retry credit' : 'Pay'}
              </Button>
            </div>
          </Dialog.Content>
        </Dialog.Overlay>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
