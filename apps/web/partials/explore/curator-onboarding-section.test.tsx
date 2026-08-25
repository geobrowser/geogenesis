import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  status: {
    completion: {} as Record<string, boolean>,
    progressPercent: 0,
    allComplete: false,
    isLoading: false,
    isVisible: true,
  },
}));

vi.mock('~/core/hooks/use-curator-onboarding-status', () => ({
  useCuratorOnboardingStatus: () => mocks.status,
}));

const { CuratorOnboardingSection } = await import('./curator-onboarding-section');

const toggle = () => screen.getByRole('button', { name: /Collapse curator onboarding|Expand curator onboarding/ });
const stepList = () => screen.queryByRole('list');

beforeEach(() => {
  mocks.status = { completion: {}, progressPercent: 0, allComplete: false, isLoading: false, isVisible: true };
});

afterEach(cleanup);

describe('CuratorOnboardingSection', () => {
  it('stays open while steps are outstanding', () => {
    render(<CuratorOnboardingSection />);

    expect(stepList()).toBeInTheDocument();
    expect(toggle()).toHaveAttribute('aria-expanded', 'true');
  });

  // Folded away rather than removed, so finishing still reads as finishing.
  it('folds down to its heading once every step is done', () => {
    mocks.status = { ...mocks.status, allComplete: true, progressPercent: 100 };
    render(<CuratorOnboardingSection />);

    expect(screen.getByRole('heading', { name: 'Curator onboarding' })).toBeInTheDocument();
    expect(screen.getByText('100% complete')).toBeInTheDocument();
    expect(stepList()).not.toBeInTheDocument();
  });

  it('opens again when asked', () => {
    mocks.status = { ...mocks.status, allComplete: true, progressPercent: 100 };
    render(<CuratorOnboardingSection />);

    fireEvent.click(toggle());

    expect(stepList()).toBeInTheDocument();
  });

  it('renders nothing when the panel has no viewer to speak of', () => {
    mocks.status = { ...mocks.status, isVisible: false };
    const { container } = render(<CuratorOnboardingSection />);

    expect(container).toBeEmptyDOMElement();
  });
});
