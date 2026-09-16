import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';

import * as React from 'react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { PersonProposal } from '~/core/profile/use-person-proposals';
import type { Profile } from '~/core/types';

import { PersonProposalsTab } from './person-proposals-tab';

const mocks = vi.hoisted(() => ({
  proposals: [] as PersonProposal[],
  isLoading: false,
  isError: false,
  /** Every space id set the label lookup was asked for, in render order. */
  labelCalls: [] as string[][],
  /** Every props object the shared governance row was rendered with. */
  rowProps: [] as Record<string, unknown>[],
}));

vi.mock('~/core/profile/use-person-proposals', () => ({
  usePersonProposals: () => ({
    proposals: mocks.proposals,
    isLoading: mocks.isLoading,
    isError: mocks.isError,
    isFetchingNextPage: false,
    hasNextPage: false,
    fetchNextPage: () => {},
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

vi.mock('~/design-system/prefetch-link', () => ({
  PrefetchLink: ({ children, href, ...rest }: React.ComponentPropsWithoutRef<'a'>) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

// The real row is exercised by the governance tab; what matters here is that
// this tab renders *that* row, with the values the record is responsible for.
vi.mock('~/partials/governance/governance-proposal-row', () => ({
  // The real one, because the percentages below are what this file asserts on.
  percentageFromCounts: (count: number, total: number) => (total === 0 ? 0 : Math.floor((count / total) * 100)),
  GovernanceProposalRow: (props: Record<string, unknown>) => {
    mocks.rowProps.push(props);
    return (
      <div data-testid="governance-row">
        {props.bylineLead as React.ReactNode}
        <h3>{props.title as string}</h3>
      </div>
    );
  },
}));

/** The personal space whose profile is being read — never where a proposal landed. */
const PROFILE_SPACE = 'f3dab79cb5a3d9d1759656dd5361d1c6';
const ACADEMIA = 'b7ebce52523244058f81f4aeb95a0b8e';

const proposer: Profile = {
  id: 'person-entity',
  spaceId: PROFILE_SPACE,
  name: 'Preston Mantel',
  avatarUrl: null,
  coverUrl: null,
  address: '0x0000000000000000000000000000000000000001',
  profileLink: `/space/${PROFILE_SPACE}`,
};

function proposal(overrides: Partial<PersonProposal> = {}): PersonProposal {
  return {
    id: 'a7decdc3e8cb46748c267cd4b09461ba',
    spaceId: ACADEMIA,
    name: 'Import universities into Academia (3/3)',
    type: 'ADD_EDIT',
    status: 'ACCEPTED',
    createdAt: 1789254358,
    startTime: 1789254363,
    endTime: 1789340763,
    yes: 3,
    no: 1,
    abstain: 0,
    ...overrides,
  };
}

function setPage(proposals: PersonProposal[]) {
  mocks.proposals = proposals;
}

function renderTab() {
  return render(<PersonProposalsTab spaceId={PROFILE_SPACE} proposer={proposer} />);
}

describe('PersonProposalsTab', () => {
  beforeEach(() => {
    mocks.proposals = [];
    mocks.isLoading = false;
    mocks.isError = false;
    mocks.labelCalls = [];
    mocks.rowProps = [];
  });

  afterEach(cleanup);

  it('renders the governance tab’s own row rather than a second proposal card', () => {
    setPage([proposal()]);

    renderTab();

    expect(screen.getByTestId('governance-row')).toBeInTheDocument();
  });

  it('links into the space the proposal landed in, and back to the profile on close', () => {
    setPage([proposal()]);

    renderTab();

    const href = screen.getByRole('link', { name: /Import universities/ }).getAttribute('href') ?? '';

    expect(href).toContain(`/space/${ACADEMIA}/governance`);
    expect(href).toContain('proposalId=a7decdc3e8cb46748c267cd4b09461ba');
    // Without these the reader is stranded in the governance tab of a space
    // they were never in — see `useCloseProposal`.
    expect(href).toContain('from=profile');
    expect(href).toContain(`returnSpaceId=${PROFILE_SPACE}`);
  });

  it('names the space in the byline, and links to it', () => {
    setPage([proposal()]);

    renderTab();

    // Its own link, above the row's full-bleed one, which would otherwise
    // swallow the click and open the proposal instead.
    expect(screen.getByRole('link', { name: 'Academia' })).toHaveAttribute('href', `/space/${ACADEMIA}`);
  });

  it('turns the tally into percentages over every vote cast, abstentions included', () => {
    setPage([proposal({ yes: 3, no: 1, abstain: 1 })]);

    renderTab();

    // 3/5 and 1/5, not 3/4 and 1/4.
    expect(mocks.rowProps.at(-1)).toMatchObject({ yesPercentage: 60, noPercentage: 20 });
  });

  it('reads as zero rather than dividing by nothing when nobody voted', () => {
    setPage([proposal({ yes: 0, no: 0, abstain: 0 })]);

    renderTab();

    expect(mocks.rowProps.at(-1)).toMatchObject({ yesPercentage: 0, noPercentage: 0 });
  });

  it('names an unnamed proposal by what it did', () => {
    // Only an edit carries a name. A membership proposal arrives nameless and is
    // named from its type and the space — an id would say nothing to a reader.
    setPage([proposal({ name: null, type: 'ADD_EDITOR' })]);

    renderTab();

    expect(screen.getByText('Add editor to Academia')).toBeInTheDocument();
  });

  it('shows the profile owner as the proposer on every row', () => {
    setPage([proposal({ id: 'one' }), proposal({ id: 'two' })]);

    renderTab();

    // Every row on this page was proposed by the same person, so the byline is
    // resolved once for the page rather than fetched per row.
    expect(mocks.rowProps.map(props => props.profile)).toEqual([proposer, proposer]);
  });

  it('offers no Execute, because a record is read rather than acted on', () => {
    setPage([proposal({ status: 'PROPOSED' })]);

    renderTab();

    expect(mocks.rowProps.at(-1)).toMatchObject({ canExecute: false });
    expect(mocks.rowProps.at(-1)?.executeIn).toBeUndefined();
  });

  it('asks for every row space once, however many rows share it', () => {
    setPage([
      proposal({ id: 'one' }),
      proposal({ id: 'two' }),
      proposal({ id: 'three', spaceId: 'cccccccccccccccccccccccccccccccc' }),
    ]);

    renderTab();

    expect(mocks.labelCalls.at(-1)).toEqual([ACADEMIA, 'cccccccccccccccccccccccccccccccc']);
  });

  it('falls back to an id fragment for a space nothing can name', () => {
    setPage([proposal({ spaceId: 'cccccccccccccccccccccccccccccccc' })]);

    renderTab();

    expect(screen.getByText('cccccccc')).toBeInTheDocument();
  });

  // A request that failed and a person who has never proposed anything are
  // different facts, and the empty line states the second one either way.
  it('says it could not load rather than that there is nothing', () => {
    mocks.isError = true;

    renderTab();

    expect(screen.getByText('Couldn’t load proposals.')).toBeInTheDocument();
    expect(screen.queryByText('No proposals yet')).not.toBeInTheDocument();
  });

  it('keeps the rows it did get when a later page fails', () => {
    setPage([proposal()]);
    mocks.isError = true;

    renderTab();

    expect(screen.getByTestId('governance-row')).toBeInTheDocument();
    expect(screen.queryByText('Couldn’t load proposals.')).not.toBeInTheDocument();
  });

  it('shows the empty state the governance tab shows', () => {
    setPage([]);

    renderTab();

    expect(screen.getByText('No proposals yet')).toBeInTheDocument();
  });

  it('scrolls rather than paging', () => {
    setPage([proposal()]);

    renderTab();

    // 765 rows on the reference account: a Next button would make the record
    // something you click through rather than read down.
    expect(screen.queryByRole('button', { name: 'Next' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Previous' })).toBeNull();
  });
});
