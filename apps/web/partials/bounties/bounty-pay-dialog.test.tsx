import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

import * as React from 'react';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { BountyPayDialog, validatePayoutAmount } from './bounty-pay-dialog';

afterEach(cleanup);

const recipient = { spaceId: 'b30570f0d43db28e6582e57eb9d5267c', name: 'Ibrahim Hassan' };

function renderDialog(overrides: Partial<React.ComponentProps<typeof BountyPayDialog>> = {}) {
  const props: React.ComponentProps<typeof BountyPayDialog> = {
    open: true,
    onOpenChange: vi.fn(),
    bountyName: 'The ranked 25',
    recipient,
    recipientLabel: 'Ibrahim Hassan',
    balance: 6880,
    balanceLoading: false,
    pendingCredit: null,
    busy: false,
    onPay: vi.fn(async () => ({ status: 'paid' as const })),
    onRetryCredit: vi.fn(async () => ({ status: 'paid' as const })),
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

  it('says the payout was published when only the credit failed, and stays open', async () => {
    const props = renderDialog({
      onPay: vi.fn(async () => ({ status: 'credit-failed' as const, message: 'ledger down' })),
    });
    fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '5' } });
    fireEvent.click(screen.getByRole('button', { name: 'Pay' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      /published, but crediting the points failed: ledger down/
    );
    expect(props.onOpenChange).not.toHaveBeenCalled();
  });

  it('offers only a credit retry while a published payout is uncredited', async () => {
    const props = renderDialog({
      pendingCredit: { payoutRelationId: 'p1', recipient, amount: 250 },
    });
    expect(screen.queryByRole('spinbutton')).not.toBeInTheDocument();
    expect(screen.getByText(/won't create a second payout/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Retry credit' }));
    await waitFor(() => expect(props.onRetryCredit).toHaveBeenCalled());
    expect(props.onPay).not.toHaveBeenCalled();
  });

  it('is the card itself inside the full-screen overlay, so the backdrop dismisses', () => {
    renderDialog();
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('data-testid', 'bounty-pay-dialog');
    expect(dialog.parentElement?.className).toMatch(/fixed inset-0/);
  });
});
