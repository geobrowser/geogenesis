import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, within } from '@testing-library/react';

import * as React from 'react';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { MEDIUM_DIFFICULTY_ID } from '~/core/bounties/ontology';
import type { BoardBounty } from '~/core/bounties/types';

import { BountyInfoCard } from './bounty-info-card';

vi.mock('~/design-system/geo-image', () => ({
  ThumbGeoImage: () => <span data-thumb-image />,
}));
vi.mock('~/design-system/prefetch-link', () => ({
  PrefetchLink: ({ children, href, ...rest }: React.ComponentPropsWithoutRef<'a'>) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
vi.mock('~/design-system/tooltip', () => ({
  Tooltip: ({ trigger }: { trigger: React.ReactNode }) => <>{trigger}</>,
}));

afterEach(cleanup);

const bounty: BoardBounty = {
  id: 'bounty-1',
  spaceId: 'space-1',
  spaceLabel: 'Health',
  spaceImage: null,
  name: 'Add top 200 drugs',
  description: null,
  budget: 1000,
  maxContributors: 3,
  submissionsPerPerson: 2,
  submissionsCount: 4,
  difficulty: 'Medium',
  difficultyId: MEDIUM_DIFFICULTY_ID,
  status: 'In progress',
  statusId: null,
  deadline: '2099-01-15T00:00:00Z',
  skills: [{ id: 'skill-1', name: 'Pharmacology' }],
  maintainers: [{ id: 'person-1', name: 'Alice' }],
  allocatedIds: ['person-2'],
  interestedCount: 5,
  updatedAt: null,
  isFeatured: false,
  contributors: [],
};

function field(label: string) {
  const dt = screen.getByText(label, { selector: 'dt' });
  return dt.parentElement!.querySelector('dd')!;
}

describe('BountyInfoCard', () => {
  it('renders every field with the right values', () => {
    render(<BountyInfoCard bounty={bounty} />);
    expect(within(field('Bounty budget')).getByText('1,000')).toBeInTheDocument();
    expect(within(field('Payout range')).getByText('200 – 1,000')).toBeInTheDocument();
    expect(within(field('Difficulty')).getByText('Medium')).toBeInTheDocument();
    expect(within(field('Skills')).getByText('Pharmacology').closest('a')).toHaveAttribute(
      'href',
      '/space/space-1/skill-1'
    );
    expect(within(field('Space')).getByText('Health').closest('a')).toHaveAttribute('href', '/space/space-1');
    expect(within(field('Maintainers')).getByText('Alice')).toBeInTheDocument();
    expect(within(field('Max contributors')).getByText('3')).toBeInTheDocument();
    expect(within(field('Max submissions per person')).getByText('2')).toBeInTheDocument();
    expect(within(field('Total submissions')).getByText('4')).toBeInTheDocument();
    expect(within(field('Interested')).getByText('5')).toBeInTheDocument();
    expect(within(field('Allocated')).getByText('1 of 3')).toBeInTheDocument();
  });

  it('hides workflow status unless asked (editors only)', () => {
    const { unmount } = render(<BountyInfoCard bounty={bounty} />);
    expect(screen.queryByText('Status', { selector: 'dt' })).not.toBeInTheDocument();
    unmount();
    render(<BountyInfoCard bounty={bounty} showStatus />);
    expect(within(field('Status')).getByText('In progress')).toBeInTheDocument();
  });

  it('shows Unlimited/None/Not set placeholders and flags an ended deadline', () => {
    render(
      <BountyInfoCard
        bounty={{
          ...bounty,
          budget: null,
          maxContributors: null,
          submissionsPerPerson: null,
          skills: [],
          maintainers: [],
          deadline: '2020-01-01T00:00:00Z',
        }}
      />
    );
    expect(within(field('Bounty budget')).getByText('Not set')).toBeInTheDocument();
    expect(within(field('Max contributors')).getByText('Unlimited')).toBeInTheDocument();
    expect(within(field('Skills')).getByText('None listed')).toBeInTheDocument();
    expect(within(field('Submission deadline')).getByText(/\(ended\)/)).toBeInTheDocument();
    // Without a max, allocated is a plain count.
    expect(within(field('Allocated')).getByText('1')).toBeInTheDocument();
  });
});
