import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

import * as React from 'react';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { BountyPayDialog, describePendingPayout, validatePayoutAmount } from './bounty-pay-dialog';

afterEach(cleanup);

const recipient = { spaceId: 'b30570f0d43db28e6582e57eb9d5267c', name: 'Ibrahim Hassan' };
const pending = (stage: 'credit' | 'publish') => ({
  stage,
  payoutRelationId: 'p1',
  recipient,
  amount: 250,
  values: [],
  relations: [],
});

function renderDialog(overrides: Partial<React.ComponentProps<typeof BountyPayDialog>> = {}) {
  const props: React.ComponentProps<typeof BountyPayDialog> = {
    open: true,
    onOpenChange: vi.fn(),
    bountyName: 'The ranked 25',
    recipient,
    recipientLabel: 'Ibrahim Hassan',
    balance: 6880,
    balanceLoading: false,
    pendingPayout: null,
    busy: false,
    onPay: vi.fn(async () => ({ status: 'paid' as const })),
    onFinish: vi.fn(async () => ({ status: 'paid' as const })),
    ...overrides,
  };
  render(<BountyPayDialog {...props} />);
  return props;
}

describe('validatePayoutAmount', () => {
  it('needs a positive whole number within the balance', () => {
    expect(validatePayoutAmount('', 100)).toBe('Enter an amount.');
    expect(validatePayoutAmount('2.5', 100)).toMatch(/whole number/);
    expect(validatePayoutAmount('0', 100)).toMatch(/whole number/);
    expect(validatePayoutAmount('101', 100)).toBe('This space only has 100 points.');
    expect(validatePayoutAmount('100', 100)).toBeNull();
    // An unknown balance is left to the ledger, which checks atomically before anything is published.
    expect(validatePayoutAmount('500', null)).toBeNull();
  });
});

describe('BountyPayDialog', () => {
  it('pays the entered amount and closes on success', async () => {
    const props = renderDialog();
    expect(screen.getByText('Space balance: 6,880 points')).toBeInTheDocument();
    expect(screen.getByText(/no submission needed/)).toBeInTheDocument();
    fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '250' } });
    fireEvent.click(screen.getByRole('button', { name: 'Pay' }));
    await waitFor(() => expect(props.onPay).toHaveBeenCalledWith(250));
    expect(props.onOpenChange).toHaveBeenCalledWith(false);
  });

  it('blocks an amount above the space balance', async () => {
    const props = renderDialog({ balance: 100 });
    fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '101' } });
    fireEvent.click(screen.getByRole('button', { name: 'Pay' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('This space only has 100 points.');
    expect(props.onPay).not.toHaveBeenCalled();
  });

  it.each([
    [{ status: 'credit-unconfirmed' as const, message: 'ledger down' }, /didn't confirm the payout \(ledger down\)/],
    [{ status: 'publish-failed' as const }, /points were paid, but the payout record could not be published/],
  ])('explains an unfinished payout and stays open (%o)', async (outcome, text) => {
    const props = renderDialog({ onPay: vi.fn(async () => outcome) });
    fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '5' } });
    fireEvent.click(screen.getByRole('button', { name: 'Pay' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(text);
    expect(props.onOpenChange).not.toHaveBeenCalled();
  });

  it('offers only to finish while a payout is unfinished', async () => {
    const props = renderDialog({ pendingPayout: pending('publish') });
    expect(screen.queryByRole('spinbutton')).not.toBeInTheDocument();
    expect(screen.getByText(/won't pay twice or create a second payout/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Finish payout' }));
    await waitFor(() => expect(props.onFinish).toHaveBeenCalled());
    expect(props.onPay).not.toHaveBeenCalled();
  });

  it('describes what is left of an unfinished payout by stage', () => {
    expect(describePendingPayout(pending('credit'))).toBe(
      "A payout of 250 points to Ibrahim Hassan was started, but the points ledger didn't confirm it."
    );
    expect(describePendingPayout(pending('publish'))).toBe(
      "250 points were paid to Ibrahim Hassan, but the payout record isn't published yet."
    );
  });

  it('is the card itself inside the full-screen overlay, so the backdrop dismisses', () => {
    renderDialog();
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('data-testid', 'bounty-pay-dialog');
    expect(dialog.parentElement?.className).toMatch(/fixed inset-0/);
  });

  it('lets the ledger decide when the space balance is unknown', async () => {
    const props = renderDialog({ balance: null });
    expect(screen.getByText('Space balance unavailable')).toBeInTheDocument();
    fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '5' } });
    fireEvent.click(screen.getByRole('button', { name: 'Pay' }));
    await waitFor(() => expect(props.onPay).toHaveBeenCalledWith(5));
  });

  it('shows why a payout was refused before anything was published', async () => {
    const props = renderDialog({
      onPay: vi.fn(async () => ({ status: 'not-paid' as const, message: 'This space only has 10 points.' })),
    });
    fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '5' } });
    fireEvent.click(screen.getByRole('button', { name: 'Pay' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Nothing was paid: This space only has 10 points.');
    expect(props.onOpenChange).not.toHaveBeenCalled();
  });
});
