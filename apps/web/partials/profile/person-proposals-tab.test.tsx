import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { PersonProposal, PersonProposalsPage } from '~/core/profile/use-person-proposals';

import { PersonProposalsTab, formatProposalDate } from './person-proposals-tab';

const mocks = vi.hoisted(() => ({
  page: null as PersonProposalsPage | null,
  isLoading: false,
  /** Every space id set the label lookup was asked for, in render order. */
  labelCalls: [] as string[][],
}));

vi.mock('~/core/profile/use-person-proposals', () => ({
  usePersonProposals: () => ({
    page: mocks.page ?? { proposals: [], endCursor: null, hasNextPage: false, totalCount: 0 },
    isLoading: mocks.isLoading,
    isPlaceholderData: false,
  }),
}));

vi.mock('~/core/hooks/use-space-labels', () => ({
  useSpaceLabels: (spaceIds: string[]) => {
    mocks.labelCalls.push(spaceIds);
    return {
      labelsById: new Map([['b7ebce52523244058f81f4aeb95a0b8e', { name: 'Academia', image: null }]]),
      isLoading: false,
    };
  },
  spaceLabel: (labelsById: Map<string, { name: string; image: string | null }>, spaceId: string) =>
    labelsById.get(spaceId),
}));

/** The personal space whose profile is being read — never where a proposal landed. */
const PROFILE_SPACE = 'f3dab79cb5a3d9d1759656dd5361d1c6';
const ACADEMIA = 'b7ebce52523244058f81f4aeb95a0b8e';

function proposal(overrides: Partial<PersonProposal> = {}): PersonProposal {
  return {
    id: 'a7decdc3e8cb46748c267cd4b09461ba',
    spaceId: ACADEMIA,
    name: 'Import universities into Academia (3/3)',
    type: 'ADD_EDIT',
    status: 'ACCEPTED',
    createdAt: 1789254358,
    endTime: 1789340763,
    yes: 1,
    no: 0,
    ...overrides,
  };
}

function setPage(proposals: PersonProposal[]) {
  mocks.page = { proposals, endCursor: null, hasNextPage: false, totalCount: proposals.length };
}

describe('PersonProposalsTab', () => {
  beforeEach(() => {
    mocks.page = null;
    mocks.isLoading = false;
    mocks.labelCalls = [];
  });

  afterEach(cleanup);

  it('links a proposal into the space it landed in, not the profile being read', () => {
    setPage([proposal()]);

    render(<PersonProposalsTab spaceId={PROFILE_SPACE} />);

    const link = screen.getByRole('link', { name: /Import universities/ });
    expect(link).toHaveAttribute('href', `/space/${ACADEMIA}/governance?proposalId=a7decdc3e8cb46748c267cd4b09461ba`);
    expect(link.getAttribute('href')).not.toContain(PROFILE_SPACE);
  });

  it('names the space, the tally and the outcome on the row', () => {
    setPage([proposal()]);

    render(<PersonProposalsTab spaceId={PROFILE_SPACE} />);

    expect(screen.getByText('Academia')).toBeInTheDocument();
    expect(screen.getByText('Accepted')).toBeInTheDocument();
    expect(screen.getByText('1 for, 0 against')).toBeInTheDocument();
  });

  it('names an unnamed proposal by what it did', () => {
    // Only an edit carries a name. A membership proposal arrives nameless and is
    // named from its type and the space — an id would say nothing to a reader.
    setPage([proposal({ name: null, type: 'ADD_EDITOR' })]);

    render(<PersonProposalsTab spaceId={PROFILE_SPACE} />);

    expect(screen.getByText('Add editor to Academia')).toBeInTheDocument();
  });

  it('asks for every row space once, however many rows share it', () => {
    setPage([
      proposal({ id: 'one' }),
      proposal({ id: 'two' }),
      proposal({ id: 'three', spaceId: 'cccccccccccccccccccccccccccccccc' }),
    ]);

    render(<PersonProposalsTab spaceId={PROFILE_SPACE} />);

    expect(mocks.labelCalls.at(-1)).toEqual([ACADEMIA, 'cccccccccccccccccccccccccccccccc']);
  });

  it('falls back to an id fragment for a space nothing can name', () => {
    setPage([proposal({ spaceId: 'cccccccccccccccccccccccccccccccc' })]);

    render(<PersonProposalsTab spaceId={PROFILE_SPACE} />);

    expect(screen.getByText('cccccccc')).toBeInTheDocument();
  });

  it('shows an empty state rather than a bare list', () => {
    setPage([]);

    render(<PersonProposalsTab spaceId={PROFILE_SPACE} />);

    expect(screen.getByText('No proposals yet.')).toBeInTheDocument();
  });

  it('leaves the date off a proposal the indexer never stamped', () => {
    setPage([proposal({ createdAt: 0 })]);

    const { container } = render(<PersonProposalsTab spaceId={PROFILE_SPACE} />);

    // Rather than rendering the epoch, which is what `new Date(0)` would print.
    expect(container.querySelector('time')).toBeNull();
    expect(screen.queryByText(/1970/)).toBeNull();
  });
});

describe('formatProposalDate', () => {
  it('formats in a fixed locale and zone, so the server and client agree', () => {
    // "Sept", not "Sep" — en-GB, the same locale the rail's Joined row uses, so
    // the two dates on a profile are spelled the same way.
    expect(formatProposalDate(1789254358)).toBe('12 Sept 2026');
  });
});
