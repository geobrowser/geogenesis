'use client';

import * as Dialog from '@radix-ui/react-dialog';

import * as React from 'react';

import { formatPoints, parseWholePoints } from '~/core/bounties/payout';
import type { DirectPayoutOutcome, PayoutRecipient, PendingPayout } from '~/core/bounties/use-direct-payout';

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
  /** A payout that started but didn't finish; the dialog then only offers to finish it. */
  pendingPayout: PendingPayout | null;
  busy: boolean;
  onPay: (amount: number) => Promise<DirectPayoutOutcome>;
  onFinish: () => Promise<DirectPayoutOutcome>;
};

/** What is left to do on an unfinished payout, in one sentence (shared with the Curators notice). */
export function describePendingPayout(pending: PendingPayout): string {
  const who = pending.recipient.name ?? 'a curator';
  const points = formatPoints(pending.amount);
  return pending.stage === 'credit'
    ? `A payout of ${points} points to ${who} was started, but the points ledger didn't confirm it.`
    : `${points} points were paid to ${who}, but the payout record isn't published yet.`;
}

/** First problem with the amount, or null. */
export function validatePayoutAmount(raw: string, balance: number | null): string | null {
  if (!raw.trim()) return 'Enter an amount.';
  const amount = parseWholePoints(raw);
  if (amount == null) return 'Amount must be a positive whole number of points.';
  // A courtesy check against the last balance read; the ledger re-checks atomically and
  // refuses an unfunded payout before anything is published, so an unknown balance is fine.
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
  pendingPayout,
  busy,
  onPay,
  onFinish,
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
    } else if (outcome.status === 'not-paid') {
      setError(`Nothing was paid: ${outcome.message}`);
    } else if (outcome.status === 'credit-unconfirmed') {
      setError(
        `The points ledger didn't confirm the payout (${outcome.message}). Finish it to retry — it won't pay twice.`
      );
    } else if (outcome.status === 'publish-unconfirmed') {
      setError(
        "The points were paid and the payout record was submitted, but it hasn't appeared yet. It may be waiting for a vote in Governance. Finish it later to check; it won't publish twice."
      );
    } else {
      setError('The points were paid, but the payout record could not be published. Finish it to retry.');
    }
  };

  const submit = async () => {
    if (pendingPayout) {
      handleOutcome(await onFinish());
      return;
    }
    const problem = validatePayoutAmount(amount, balance);
    if (problem) {
      setError(problem);
      return;
    }
    setError(null);
    handleOutcome(await onPay(parseWholePoints(amount)!));
  };

  return (
    <Dialog.Root
      open={open}
      onOpenChange={next => {
        // Closing mid-payout would hide the outcome of a points transfer.
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
                    Pay {pendingPayout ? pendingPayout.recipient.name || recipientLabel : recipientLabel}
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

            {pendingPayout ? (
              <Text variant="metadata">
                {describePendingPayout(pendingPayout)} Finish it now. This won&apos;t pay twice or create a second
                payout.
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
              <Button variant="primary" disabled={busy || (!pendingPayout && !recipient)} onClick={() => void submit()}>
                {busy ? 'Paying…' : pendingPayout ? 'Finish payout' : 'Pay'}
              </Button>
            </div>
          </Dialog.Content>
        </Dialog.Overlay>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
