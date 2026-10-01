import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { PLACEHOLDER_SPACE_IMAGE } from '~/core/constants';

import { Following } from './profile-rail';

const OWNER_SPACE = '11111111111111111111111111111111';
const OTHER_SPACE = '99999999999999999999999999999999';
const TOPIC_A = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const TOPIC_B = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
const TOPIC_HOME = '33333333333333333333333333333333';

type Row = { id: string; spaceId: string; toEntityId: string };
type Meta = { name: string | null; image: string; spaces: { id: string }[] };

const mocks = vi.hoisted(() => ({
  // Inlined literal (not OWNER_SPACE): vi.hoisted runs before the module's const declarations.
  personalSpaceId: '11111111111111111111111111111111' as string | null,
  rows: [] as Row[],
  isLoading: false,
  metadata: new Map<string, Meta>(),
  metadataLoading: false,
  unfollow: vi.fn(),
  pending: new Set<string>(),
}));

vi.mock('~/core/hooks/use-personal-space-id', () => ({
  usePersonalSpaceId: () => ({ personalSpaceId: mocks.personalSpaceId }),
}));
vi.mock('~/core/topics/use-followed-topics', () => ({
  useFollowedTopics: () => ({
    rows: mocks.rows,
    topicIds: new Set(mocks.rows.map(row => row.toEntityId)),
    isLoading: mocks.isLoading,
  }),
}));
vi.mock('~/core/topics/use-topic-metadata', () => ({
  useTopicMetadata: () => ({ metadata: mocks.metadata, isLoading: mocks.metadataLoading }),
}));
vi.mock('~/core/topics/use-follow-topics', () => ({
  useFollowTopics: () => ({
    follow: vi.fn(),
    unfollow: mocks.unfollow,
    isPending: (id: string) => mocks.pending.has(id),
    canFollow: true,
  }),
}));
// Rendered as a bare img so the resolved value (real image vs placeholder) is directly assertable.
vi.mock('~/design-system/fallback-image', () => ({
  FallbackImage: ({ value }: { value: string }) => <img data-testid="topic-image" data-value={value} alt="" />,
}));
vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

function row(toEntityId: string, id = `rel-${toEntityId}`): Row {
  return { id, spaceId: OWNER_SPACE, toEntityId };
}

beforeAll(() => {
  // Radix Popover's positioning reads these, which jsdom does not provide.
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  Element.prototype.hasPointerCapture ??= () => false;
  Element.prototype.setPointerCapture ??= () => {};
  Element.prototype.releasePointerCapture ??= () => {};
  Element.prototype.scrollIntoView ??= () => {};
});

beforeEach(() => {
  mocks.personalSpaceId = OWNER_SPACE;
  mocks.rows = [];
  mocks.isLoading = false;
  mocks.metadata = new Map();
  mocks.metadataLoading = false;
  mocks.unfollow = vi.fn().mockResolvedValue(true);
  mocks.pending = new Set();
});

afterEach(cleanup);

function renderFollowing(spaceId = OWNER_SPACE) {
  return render(<Following spaceId={spaceId} />);
}

describe('Following row visibility', () => {
  it('renders nothing when the space follows nothing', () => {
    renderFollowing();
    expect(screen.queryByText('Following')).not.toBeInTheDocument();
  });

  it('pulses the value while follows are still loading', () => {
    mocks.rows = [row(TOPIC_A)];
    mocks.isLoading = true;
    renderFollowing();
    expect(screen.getByText('Following')).toBeInTheDocument();
    expect(screen.queryByText('Untitled')).not.toBeInTheDocument();
    expect(document.querySelector('.animate-pulse')).toBeInTheDocument();
  });

  it('pulses the value while topic metadata is still loading, so no topic flashes as "Untitled"', () => {
    mocks.rows = [row(TOPIC_A)];
    mocks.metadataLoading = true;
    renderFollowing();
    expect(screen.getByText('Following')).toBeInTheDocument();
    expect(screen.queryByText('Untitled')).not.toBeInTheDocument();
    expect(document.querySelector('.animate-pulse')).toBeInTheDocument();
  });
});

describe('Following row count and stack', () => {
  beforeEach(() => {
    mocks.rows = [
      TOPIC_A,
      TOPIC_B,
      '44444444444444444444444444444444',
      '55555555555555555555555555555555',
      '66666666666666666666666666666666',
    ].map(id => row(id));
    for (const { toEntityId } of mocks.rows) {
      mocks.metadata.set(toEntityId, {
        name: `Topic ${toEntityId[0]}`,
        image: `ipfs://${toEntityId}`,
        spaces: [{ id: TOPIC_HOME }],
      });
    }
  });

  it('shows the count, a stack of three, and a +N badge for the rest', () => {
    renderFollowing();

    expect(screen.getByLabelText('Following 5 topics')).toBeInTheDocument();
    // The visible numeric count, which this row shows unlike "Verified by".
    expect(within(screen.getByLabelText('Following 5 topics')).getByText('5')).toBeInTheDocument();
    // Three faces in the closed stack, then the tail.
    expect(screen.getAllByTestId('topic-image')).toHaveLength(3);
    expect(screen.getByText('+2')).toBeInTheDocument();
  });
});

describe('Following dropdown', () => {
  beforeEach(() => {
    mocks.rows = [row(TOPIC_A), row(TOPIC_B)];
    mocks.metadata.set(TOPIC_A, { name: 'Mental health', image: 'ipfs://a', spaces: [{ id: TOPIC_HOME }] });
    // No image → the placeholder stands in, in both stack and list.
    mocks.metadata.set(TOPIC_B, {
      name: 'Russia-Ukraine war',
      image: PLACEHOLDER_SPACE_IMAGE,
      spaces: [{ id: TOPIC_HOME }],
    });
  });

  it('lists every followed topic, each linking to its topic page', async () => {
    renderFollowing();
    await userEvent.click(screen.getByLabelText('Following 2 topics'));

    const mentalHealth = screen.getByRole('link', { name: /Mental health/ });
    expect(mentalHealth).toHaveAttribute('href', `/space/${TOPIC_HOME}/${TOPIC_A}`);
    expect(screen.getByRole('link', { name: /Russia-Ukraine war/ })).toHaveAttribute(
      'href',
      `/space/${TOPIC_HOME}/${TOPIC_B}`
    );
  });

  it('shows the placeholder image for a topic with no image', async () => {
    renderFollowing();
    await userEvent.click(screen.getByLabelText('Following 2 topics'));

    const warRow = screen.getByRole('link', { name: /Russia-Ukraine war/ });
    const image = within(warRow).getByTestId('topic-image');
    expect(image).toHaveAttribute('data-value', PLACEHOLDER_SPACE_IMAGE);
  });

  it('keeps the list in its own scroll container so 100+ topics do not grow the page', async () => {
    mocks.rows = Array.from({ length: 120 }, (_, i) => row(i.toString(16).padStart(32, '0'), `rel-${i}`));
    renderFollowing();
    await userEvent.click(screen.getByLabelText('Following 120 topics'));

    const scroll = document.querySelector('.overflow-y-auto');
    expect(scroll).toBeInTheDocument();
    expect(scroll).toHaveClass('max-h-64', 'overflow-y-auto');
  });
});

describe('Following unfollow control', () => {
  beforeEach(() => {
    mocks.rows = [row(TOPIC_A)];
    mocks.metadata.set(TOPIC_A, { name: 'Mental health', image: 'ipfs://a', spaces: [{ id: TOPIC_HOME }] });
  });

  it('lets the owner unfollow a topic from the list', async () => {
    renderFollowing(OWNER_SPACE);
    await userEvent.click(screen.getByLabelText('Following 1 topic'));

    await userEvent.click(screen.getByRole('button', { name: 'Unfollow Mental health' }));
    expect(mocks.unfollow).toHaveBeenCalledWith([TOPIC_A]);
  });

  it('disables the unfollow control while that topic is being written', async () => {
    mocks.pending = new Set([TOPIC_A]);
    renderFollowing(OWNER_SPACE);
    await userEvent.click(screen.getByLabelText('Following 1 topic'));

    expect(screen.getByRole('button', { name: 'Unfollow Mental health' })).toBeDisabled();
  });

  it('shows visitors the list without any unfollow control', async () => {
    // A visitor: the space being viewed is not the viewer's personal space.
    mocks.personalSpaceId = OTHER_SPACE;
    renderFollowing(OWNER_SPACE);
    await userEvent.click(screen.getByLabelText('Following 1 topic'));

    expect(screen.getByRole('link', { name: /Mental health/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Unfollow/ })).not.toBeInTheDocument();
  });
});
