import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { ProfileDebateHiddenToast } from './profile-debate-hidden-toast';

const mocks = vi.hoisted(() => ({ push: vi.fn(), setToast: vi.fn() }));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mocks.push }),
}));

vi.mock('~/core/hooks/use-toast', () => ({
  useToast: () => [null, mocks.setToast],
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('ProfileDebateHiddenToast', () => {
  it('explains where the debate went and opens the hidden debates view', () => {
    render(<ProfileDebateHiddenToast personalSpaceId="personal-space" />);

    expect(screen.getByText(/Manage hidden debates in the Debates tab/)).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'View hidden debates' }));

    expect(mocks.setToast).toHaveBeenCalledWith(null);
    expect(mocks.push).toHaveBeenCalledWith('/space/personal-space/debates?hidden=true');
  });
});
