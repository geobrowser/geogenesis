import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

import * as React from 'react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { deadlineFromDateInput } from '~/core/bounties/date-input';

import { BountyForm, validateBountyForm } from './bounty-form';

const mocks = vi.hoisted(() => ({
  reconcile: vi.fn(),
  push: vi.fn(),
  makeProposal: vi.fn(),
  setToast: vi.fn(),
  invalidateQueries: vi.fn(() => Promise.resolve()),
  metrics: {
    data: { balance: 1000, totalPaidOut: 0 } as { balance: number; totalPaidOut: number } | undefined,
    isError: false,
  },
  access: { isEditor: true, isLoading: false },
  profile: { id: 'person-1', spaceId: 'personal-1', name: 'Bob' } as {
    id: string;
    spaceId: string;
    name: string | null;
  } | null,
}));

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: mocks.push }) }));
vi.mock('@tanstack/react-query', () => ({
  useQuery: () => mocks.metrics,
  useQueryClient: () => ({ invalidateQueries: mocks.invalidateQueries }),
}));
vi.mock('~/core/bounties/reconcile-store', () => ({ reconcileDeletedRelations: mocks.reconcile }));
vi.mock('~/core/hooks/use-publish', () => ({ usePublish: () => ({ makeProposal: mocks.makeProposal }) }));
vi.mock('~/core/hooks/use-toast', () => ({ useToast: () => [null, mocks.setToast] }));
vi.mock('~/core/hooks/use-access-control', () => ({ useAccessControl: () => mocks.access }));
vi.mock('~/core/hooks/use-smart-account', () => ({
  useSmartAccount: () => ({ smartAccount: { account: { address: '0xabc' } }, isLoading: false }),
}));
vi.mock('~/core/hooks/use-geo-profile', () => ({ useGeoProfile: () => ({ profile: mocks.profile }) }));
vi.mock('~/core/bounties/config', () => ({ useBountiesEnabled: () => true }));
vi.mock('~/design-system/select-entity', () => ({
  SelectEntity: () => <input aria-label="entity search" />,
}));
vi.mock('~/design-system/select', () => ({
  Select: ({
    value,
    onChange,
    options,
  }: {
    value: string;
    onChange: (v: string) => void;
    options: { value: string; label: string }[];
  }) => (
    <select value={value} onChange={e => onChange(e.target.value)} aria-label="select">
      {options.map(o => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  ),
}));

beforeEach(() => {
  mocks.push.mockReset();
  mocks.makeProposal.mockReset();
  mocks.setToast.mockReset();
  mocks.metrics = { data: { balance: 1000, totalPaidOut: 0 }, isError: false };
  mocks.access = { isEditor: true, isLoading: false };
});
afterEach(cleanup);

describe('deadlineFromDateInput', () => {
  it('turns a date into end-of-day UTC and rejects garbage', () => {
    expect(deadlineFromDateInput('2026-12-31')).toBe('2026-12-31T23:59:59.000Z');
    expect(deadlineFromDateInput('')).toBeNull();
    expect(deadlineFromDateInput('nope')).toBeNull();
  });
});

describe('validateBountyForm', () => {
  const base = {
    name: 'X',
    budget: '',
    maxContributors: '',
    maxSubmissionsPerPerson: '',
    deadline: '',
  };

  it('requires a name and numeric fields', () => {
    expect(validateBountyForm({ ...base, name: '  ' })).toMatchObject({ ok: false, message: 'Add a bounty name.' });
    expect(validateBountyForm({ ...base, budget: 'abc' })).toMatchObject({ ok: false });
    expect(validateBountyForm({ ...base, maxContributors: '1.5' })).toMatchObject({ ok: false });
    expect(validateBountyForm({ ...base, deadline: 'nope' })).toMatchObject({ ok: false });
  });

  it('does not cap the budget — the space ledger no longer gates bounty creation', () => {
    expect(validateBountyForm({ ...base, budget: '999999' })).toMatchObject({ ok: true, budget: 999999 });
  });

  it('parses blanks as null', () => {
    expect(validateBountyForm(base)).toEqual({
      ok: true,
      budget: null,
      maxContributors: null,
      maxSubmissionsPerPerson: null,
    });
  });
});

describe('BountyForm', () => {
  it('refuses non-editors', () => {
    mocks.access = { isEditor: false, isLoading: false };
    render(<BountyForm spaceId="space-1" />);
    expect(screen.getByTestId('bounty-form-denied')).toBeInTheDocument();
  });

  it('toasts validation errors instead of publishing', () => {
    render(<BountyForm spaceId="space-1" />);
    fireEvent.click(screen.getByRole('button', { name: 'Publish bounty' }));
    expect(mocks.setToast).toHaveBeenCalled();
    expect(mocks.makeProposal).not.toHaveBeenCalled();
  });

  it('hides contributor limits for easy bounties', () => {
    render(<BountyForm spaceId="space-1" />);
    expect(screen.getByText('Max contributors')).toBeInTheDocument();
    fireEvent.change(screen.getAllByLabelText('select')[0], { target: { value: 'easy' } });
    expect(screen.queryByText('Max contributors')).not.toBeInTheDocument();
  });

  it('publishes a create proposal into the space and navigates to the new bounty', async () => {
    mocks.makeProposal.mockImplementation(async ({ onSuccess }: { onSuccess: () => Promise<void> }) => onSuccess());
    render(<BountyForm spaceId="space-1" />);
    fireEvent.change(screen.getByPlaceholderText('What needs curating?'), { target: { value: 'Add drugs' } });
    fireEvent.change(screen.getByPlaceholderText('Total for all contributors'), { target: { value: '500' } });
    fireEvent.click(screen.getByRole('button', { name: 'Publish bounty' }));

    await waitFor(() => expect(mocks.makeProposal).toHaveBeenCalledTimes(1));
    const call = mocks.makeProposal.mock.calls[0][0];
    expect(call.spaceId).toBe('space-1');
    expect(call.name).toBe('Create bounty: Add drugs');
    expect(call.values.some((v: { value: string }) => v.value === 'Add drugs')).toBe(true);
    await waitFor(() =>
      expect(mocks.push).toHaveBeenCalledWith(expect.stringMatching(/^\/space\/space-1\/[0-9a-f]{32}$/))
    );
    expect(mocks.invalidateQueries).toHaveBeenCalled();
  });
});
