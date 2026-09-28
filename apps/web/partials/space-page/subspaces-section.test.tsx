import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import * as React from 'react';

import { afterEach, describe, expect, it, vi } from 'vitest';

import type { TopicUsage } from '~/core/io/subgraph/topic-space-usage';

// The real one reaches for the sync engine to warm a route; the destination is what matters here.
// `className` is forwarded because the pill's width constraint lives on it — a mock that dropped it
// would quietly make the truncation assertion below unfalsifiable.
vi.mock('~/design-system/prefetch-link', () => ({
  PrefetchLink: ({ children, href, className }: { children: React.ReactNode; href: string; className?: string }) => (
    <a href={href} className={className}>
      {children}
    </a>
  ),
}));

const { SubspacesSection } = await import('./subspaces-section');

const SPACE_ID = 'a19c345ab9866679b001d7d2138d88a1';
const OTHER_SPACE_ID = 'b29c345ab9866679b001d7d2138d88a2';

afterEach(cleanup);

function subspace(overrides: Partial<TopicUsage> & Pick<TopicUsage, 'id' | 'name'>): TopicUsage {
  return { image: undefined, spaces: [], spacesCount: 0, ...overrides };
}

describe('SubspacesSection', () => {
  it('renders nothing when the space has no subspaces', () => {
    const { container } = render(<SubspacesSection spaceId={SPACE_ID} subspaces={[]} />);

    // The rail composes sections by presence, so an empty one has to be absent rather than a
    // heading with nothing under it.
    expect(container).toBeEmptyDOMElement();
  });

  it('links a subspace to its own space when the topic is published in one', () => {
    render(
      <SubspacesSection
        spaceId={SPACE_ID}
        subspaces={[
          subspace({
            id: 'topic-1',
            name: 'Climate',
            spaces: [{ id: OTHER_SPACE_ID, name: 'Climate', image: 'ipfs://climate' }],
          }),
        ]}
      />
    );

    expect(screen.getByRole('link', { name: /Climate/ })).toHaveAttribute('href', `/space/${OTHER_SPACE_ID}`);
  });

  it('links to the topic inside this space when it has no space of its own', () => {
    render(<SubspacesSection spaceId={SPACE_ID} subspaces={[subspace({ id: 'topic-2', name: 'Housing' })]} />);

    // The gallery this replaces resolved the destination the same way; a topic nobody has made a
    // space for is still readable as an entity of the space that lists it.
    expect(screen.getByRole('link', { name: /Housing/ })).toHaveAttribute('href', `/space/${SPACE_ID}/${'topic-2'}`);
  });

  it('caps the list and reveals the rest on demand', async () => {
    const user = userEvent.setup();
    const many = Array.from({ length: 12 }, (_, i) => subspace({ id: `topic-${i}`, name: `Topic ${i}` }));

    render(<SubspacesSection spaceId={SPACE_ID} subspaces={many} />);

    // Nine, not twelve: the rail is narrow and pills wrap, so an uncapped list pushes everything
    // below it off the screen.
    expect(screen.getAllByRole('link')).toHaveLength(9);

    await user.click(screen.getByRole('button', { name: 'Show more' }));
    expect(screen.getAllByRole('link')).toHaveLength(12);

    await user.click(screen.getByRole('button', { name: 'Show less' }));
    expect(screen.getAllByRole('link')).toHaveLength(9);
  });

  it('tells assistive tech whether the overflow is open', async () => {
    const user = userEvent.setup();
    const many = Array.from({ length: 12 }, (_, i) => subspace({ id: `topic-${i}`, name: `Topic ${i}` }));

    render(<SubspacesSection spaceId={SPACE_ID} subspaces={many} />);

    // A changing label says what the control does, not what state the list is in. The list is
    // shared with Join spaces, so this covers both.
    expect(screen.getByRole('button')).toHaveAttribute('aria-expanded', 'false');

    await user.click(screen.getByRole('button'));
    expect(screen.getByRole('button')).toHaveAttribute('aria-expanded', 'true');
  });

  it('constrains a long name so it ellipsises instead of widening the pill past the rail', () => {
    render(
      <SubspacesSection
        spaceId={SPACE_ID}
        subspaces={[subspace({ id: 'topic-long', name: 'A subspace with a genuinely very long name indeed' })]}
      />
    );

    // Both classes are needed and neither is obvious: `truncate` alone does nothing to a flex item,
    // which defaults to `min-width: auto` and refuses to shrink below its text. Shared with Join
    // spaces, which had the same gap.
    const label = screen.getByText('A subspace with a genuinely very long name indeed');
    expect(label).toHaveClass('truncate');
    expect(label).toHaveClass('min-w-0');
    expect(screen.getByRole('link')).toHaveClass('max-w-full');
  });

  it('offers no overflow control when everything already fits', () => {
    const nine = Array.from({ length: 9 }, (_, i) => subspace({ id: `topic-${i}`, name: `Topic ${i}` }));

    render(<SubspacesSection spaceId={SPACE_ID} subspaces={nine} />);

    expect(screen.queryByRole('button', { name: 'Show more' })).not.toBeInTheDocument();
  });
});
