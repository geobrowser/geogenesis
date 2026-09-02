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
const { CURATOR_ONBOARDING_STEPS, VISIBLE_CURATOR_ONBOARDING_STEPS } =
  await import('~/core/explore/curator-onboarding-steps');

const toggle = () => screen.getByRole('button', { name: /Collapse curator onboarding|Expand curator onboarding/ });
const stepList = () => screen.queryByRole('list');

beforeEach(() => {
  mocks.status = { completion: {}, progressPercent: 0, allComplete: false, isLoading: false, isVisible: true };
});

afterEach(cleanup);

describe('CuratorOnboardingSection', () => {
  // GEO-2800. The hidden steps keep their entry and their tracking; the card must not draw them.
  it('lists every visible step and no hidden one', () => {
    render(<CuratorOnboardingSection />);

    const shown = screen.getAllByRole('listitem').length;
    expect(shown).toBe(VISIBLE_CURATOR_ONBOARDING_STEPS.length);

    for (const step of CURATOR_ONBOARDING_STEPS.filter(candidate => candidate.hidden)) {
      expect(screen.queryByText(step.title)).toBeNull();
    }
  });

  it('leads with the debate-focused steps', () => {
    // The order is the ticket's, and it is what a reader arriving at the card sees first.
    render(<CuratorOnboardingSection />);

    const titles = screen.getAllByRole('listitem').map(item => item.textContent);
    expect(titles[0]).toContain('Join a space');
    expect(titles[1]).toContain('Take a position on a claim');
    expect(titles[2]).toContain('Record a debate');
    expect(titles[3]).toContain('Choose the winner of a debate');
  });

  it('stays open while steps are outstanding', () => {
    render(<CuratorOnboardingSection />);

    expect(stepList()).toBeInTheDocument();
    expect(toggle()).toHaveAttribute('aria-expanded', 'true');
  });

  // Folded away rather than removed, so finishing still reads as finishing.
  it('folds down to its heading once every step is done', () => {
    mocks.status = { ...mocks.status, allComplete: true, progressPercent: 100 };
    render(<CuratorOnboardingSection />);

    expect(screen.getByRole('heading', { name: 'Debates Onboarding' })).toBeInTheDocument();
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
