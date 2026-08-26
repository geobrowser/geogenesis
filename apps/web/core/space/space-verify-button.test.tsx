import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import type { ReactElement } from 'react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { SpaceVerifyButton } from './space-verify-button';

const PERSONAL_SPACE_ID = '11111111-1111-1111-1111-111111111111';
const VIEWED_SPACE_ID = '22222222-2222-2222-2222-222222222222';

const mocks = vi.hoisted(() => ({
  fetchSpaceVerification: vi.fn(),
  personalSpace: vi.fn(),
  setSubspace: vi.fn(),
  unsetSubspace: vi.fn(),
  subspace: vi.fn(),
}));

vi.mock('~/core/hooks/use-personal-space-id', () => ({
  usePersonalSpaceId: () => mocks.personalSpace(),
}));

vi.mock('~/core/hooks/use-subspace', () => ({
  useSubspace: () => mocks.subspace(),
}));

vi.mock('~/core/io/subgraph/fetch-space-verification', () => ({
  fetchSpaceVerification: (...args: unknown[]) => mocks.fetchSpaceVerification(...args),
}));

beforeEach(() => {
  mocks.fetchSpaceVerification.mockReset().mockResolvedValue(false);
  mocks.personalSpace.mockReset().mockReturnValue({
    personalSpaceId: PERSONAL_SPACE_ID,
    isRegistered: true,
    isLoading: false,
  });
  mocks.setSubspace.mockReset();
  mocks.unsetSubspace.mockReset();
  mocks.subspace.mockReset().mockReturnValue({
    setSubspace: mocks.setSubspace,
    setStatus: 'idle',
    unsetSubspace: mocks.unsetSubspace,
    unsetStatus: 'idle',
  });
});

afterEach(cleanup);

describe('SpaceVerifyButton', () => {
  it('verifies the viewed space from the viewer personal space', async () => {
    renderButton(<SpaceVerifyButton spaceId={VIEWED_SPACE_ID} />);

    await userEvent.click(await screen.findByRole('button', { name: 'Verify' }));

    expect(mocks.setSubspace).toHaveBeenCalledWith(
      { subspaceId: VIEWED_SPACE_ID, relationType: 'verified' },
      expect.objectContaining({ onSuccess: expect.any(Function) })
    );
  });

  it('shows the verified state immediately after a successful verification', async () => {
    renderButton(<SpaceVerifyButton spaceId={VIEWED_SPACE_ID} />);
    await userEvent.click(await screen.findByRole('button', { name: 'Verify' }));

    const [, options] = mocks.setSubspace.mock.calls[0];
    options.onSuccess();

    await waitFor(() => expect(screen.getByRole('button', { name: 'Remove verification' })).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: 'Verify' })).not.toBeInTheDocument();
  });

  it('shows a verified action when the relationship already exists', async () => {
    mocks.fetchSpaceVerification.mockResolvedValue(true);

    renderButton(<SpaceVerifyButton spaceId={VIEWED_SPACE_ID} />);

    expect(await screen.findByRole('button', { name: 'Remove verification' })).toBeInTheDocument();
    expect(mocks.setSubspace).not.toHaveBeenCalled();
  });

  it('removes an existing verification and returns to the verify action', async () => {
    mocks.fetchSpaceVerification.mockResolvedValue(true);

    renderButton(<SpaceVerifyButton spaceId={VIEWED_SPACE_ID} />);
    await userEvent.click(await screen.findByRole('button', { name: 'Remove verification' }));

    expect(mocks.unsetSubspace).toHaveBeenCalledWith(
      { subspaceId: VIEWED_SPACE_ID, relationType: 'verified' },
      expect.objectContaining({ onSuccess: expect.any(Function) })
    );

    const [, options] = mocks.unsetSubspace.mock.calls[0];
    options.onSuccess();

    await waitFor(() => expect(screen.getByRole('button', { name: 'Verify' })).toBeInTheDocument());
  });

  it('renders the verify action with a tick before its label', async () => {
    renderButton(<SpaceVerifyButton spaceId={VIEWED_SPACE_ID} />);

    const button = await screen.findByRole('button', { name: 'Verify' });

    expect(button.querySelector('svg')).toBeInTheDocument();
    expect(button).toHaveClass('h-[18px]', 'border-dashed', 'border-grey-03', 'text-grey-04');
  });

  it('does not offer to verify the viewer personal space', () => {
    renderButton(<SpaceVerifyButton spaceId={PERSONAL_SPACE_ID} />);

    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(mocks.fetchSpaceVerification).not.toHaveBeenCalled();
  });

  it('does not show the action without a registered personal space', () => {
    mocks.personalSpace.mockReturnValue({ personalSpaceId: null, isRegistered: false, isLoading: false });

    renderButton(<SpaceVerifyButton spaceId={VIEWED_SPACE_ID} />);

    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});

function renderButton(button: ReactElement) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={queryClient}>{button}</QueryClientProvider>);
}
