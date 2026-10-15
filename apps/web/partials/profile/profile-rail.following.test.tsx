import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { PLACEHOLDER_SPACE_IMAGE } from '~/core/constants';

import { FollowersRow, FollowingRow } from './profile-rail';

const OWNER_SPACE = '11111111111111111111111111111111';
const OTHER_SPACE = '99999999999999999999999999999999';
const TOPIC_A = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const TOPIC_B = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
const TOPIC_HOME = '33333333333333333333333333333333';
const ADA_SPACE = '44444444444444444444444444444444';
const ZED_SPACE = '55555555555555555555555555555555';

type Meta = { name: string | null; image: string; homeSpaceId: string | null };

const mocks = vi.hoisted(() => ({
  // Inlined literal (not OWNER_SPACE): vi.hoisted runs before the module's const declarations.
  personalSpaceId: '11111111111111111111111111111111' as string | null,
  /** Followed topic ids, as the Interested read returns them. */
  topicIds: [] as string[],
  isLoading: false,
  metadata: new Map<string, Meta>(),
  metadataLoading: false,
  metadataError: false,
  unfollow: vi.fn(),
  pending: new Set<string>(),
  /** Personal spaces the space lookup knows, by id: these follows are people. */
  spaces: new Map<string, { id: string; entity: { name: string; image: string | null } }>(),
  followers: null as { count: number; ids: string[] } | null,
  /** The space lookup is holding a previous id set's map (`keepPreviousData`). */
  spacesPlaceholder: false,
  /** Followed ids the follow itself marks as people, whether or not the lookup has them yet. */
  personIds: [] as string[],
}));

vi.mock('~/core/hooks/use-personal-space-id', () => ({
  usePersonalSpaceId: () => ({ personalSpaceId: mocks.personalSpaceId }),
}));
vi.mock('~/core/topics/use-followed-topics', () => ({
  // What each id is comes with the follow; here a followed id the space lookup knows is a person.
  useFollowedInterests: () => ({
    ids: new Set(mocks.topicIds),
    kinds: new Map(
      mocks.topicIds.map(id => [id, mocks.spaces.has(id) || mocks.personIds.includes(id) ? 'person' : 'topic'])
    ),
    isLoading: mocks.isLoading,
  }),
}));
vi.mock('~/core/hooks/use-spaces-by-ids', () => ({
  useSpacesByIds: () => ({
    spaces: [],
    spacesById: mocks.spaces,
    isLoading: false,
    isPlaceholderData: mocks.spacesPlaceholder,
  }),
}));
vi.mock('~/core/follows/person-follow-counts', () => ({
  usePersonFollowers: () => mocks.followers,
}));
vi.mock('~/core/topics/use-topic-metadata', () => ({
  useTopicMetadata: () => ({
    metadata: mocks.metadata,
    isLoading: mocks.metadataLoading,
    isError: mocks.metadataError,
  }),
}));
vi.mock('~/core/topics/use-follow-topics', () => ({
  useFollowEntities: () => ({
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
  mocks.topicIds = [];
  mocks.isLoading = false;
  mocks.metadata = new Map();
  mocks.metadataLoading = false;
  mocks.metadataError = false;
  mocks.unfollow = vi.fn().mockResolvedValue(true);
  mocks.pending = new Set();
  mocks.spaces = new Map();
  mocks.followers = null;
  mocks.spacesPlaceholder = false;
  mocks.personIds = [];
});

afterEach(cleanup);

function renderFollowing(spaceId = OWNER_SPACE) {
  return render(<FollowingRow spaceId={spaceId} />);
}

describe('Following row visibility', () => {
  it('renders nothing when the space follows nothing', () => {
    renderFollowing();
    expect(screen.queryByText('Following')).not.toBeInTheDocument();
  });

  it('pulses the value while follows are still loading', () => {
    mocks.topicIds = [TOPIC_A];
    mocks.isLoading = true;
    renderFollowing();
    expect(screen.getByText('Following')).toBeInTheDocument();
    expect(screen.queryByText('Untitled')).not.toBeInTheDocument();
    expect(document.querySelector('.animate-pulse')).toBeInTheDocument();
  });

  it('pulses the value while topic metadata is still loading, so no topic flashes as "Untitled topic"', () => {
    mocks.topicIds = [TOPIC_A];
    mocks.metadataLoading = true;
    renderFollowing();
    expect(screen.getByText('Following')).toBeInTheDocument();
    expect(screen.queryByText('Untitled')).not.toBeInTheDocument();
    expect(document.querySelector('.animate-pulse')).toBeInTheDocument();
  });

  it('stops pulsing and falls back to "Untitled topic" rows when topic metadata fails to load', async () => {
    mocks.topicIds = [TOPIC_A];
    mocks.metadataError = true;
    renderFollowing();

    expect(screen.getByText('Following')).toBeInTheDocument();
    expect(document.querySelector('.animate-pulse')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Following: 1 follow')).toBeInTheDocument();

    await userEvent.click(screen.getByLabelText('Following: 1 follow'));
    expect(screen.getByText('Untitled topic')).toBeInTheDocument();
  });
});

describe('Following row data', () => {
  it('lists Interested follows', async () => {
    // #2685 read `Following` relation rows, so an Interested follow never appeared.
    mocks.topicIds = [TOPIC_A];
    mocks.metadata.set(TOPIC_A, { name: 'Mental health', image: 'ipfs://a', homeSpaceId: TOPIC_HOME });
    renderFollowing();
    await userEvent.click(screen.getByLabelText('Following: 1 follow'));

    expect(screen.getByRole('link', { name: /Mental health/ })).toBeInTheDocument();
  });

  it('orders the list by name', async () => {
    mocks.topicIds = [TOPIC_A, TOPIC_B];
    mocks.metadata.set(TOPIC_A, { name: 'Zoning', image: 'ipfs://a', homeSpaceId: TOPIC_HOME });
    mocks.metadata.set(TOPIC_B, { name: 'Energy', image: 'ipfs://b', homeSpaceId: TOPIC_HOME });
    renderFollowing();
    await userEvent.click(screen.getByLabelText('Following: 2 follows'));

    expect(screen.getAllByRole('link').map(link => link.textContent)).toEqual(['Energy', 'Zoning']);
  });
});

describe('Following row count and stack', () => {
  beforeEach(() => {
    mocks.topicIds = [
      TOPIC_A,
      TOPIC_B,
      '44444444444444444444444444444444',
      '55555555555555555555555555555555',
      '66666666666666666666666666666666',
    ];
    for (const toEntityId of mocks.topicIds) {
      mocks.metadata.set(toEntityId, {
        name: `Topic ${toEntityId[0]}`,
        image: `ipfs://${toEntityId}`,
        homeSpaceId: TOPIC_HOME,
      });
    }
  });

  it('shows a stack of three and a +N badge for the rest, with no number before it', () => {
    renderFollowing();

    // Drawn like "Verified by": the total reads off the stack, and is spoken by the label.
    const row = screen.getByLabelText('Following: 5 follows');
    expect(row.textContent).toBe('+2');
    // Three faces in the closed stack, then the tail.
    expect(screen.getAllByTestId('topic-image')).toHaveLength(3);
  });

  it('draws no badge when every follow fits in the stack', () => {
    mocks.topicIds = [TOPIC_A, TOPIC_B];
    renderFollowing();

    expect(screen.getByLabelText('Following: 2 follows').textContent).toBe('');
    expect(screen.getAllByTestId('topic-image')).toHaveLength(2);
  });
});

describe('Following dropdown', () => {
  beforeEach(() => {
    mocks.topicIds = [TOPIC_A, TOPIC_B];
    mocks.metadata.set(TOPIC_A, { name: 'Mental health', image: 'ipfs://a', homeSpaceId: TOPIC_HOME });
    // No image → the placeholder stands in, in both stack and list.
    mocks.metadata.set(TOPIC_B, {
      name: 'Russia-Ukraine war',
      image: PLACEHOLDER_SPACE_IMAGE,
      homeSpaceId: TOPIC_HOME,
    });
  });

  it('lists every followed topic, each linking to its topic page', async () => {
    renderFollowing();
    await userEvent.click(screen.getByLabelText('Following: 2 follows'));

    const mentalHealth = screen.getByRole('link', { name: /Mental health/ });
    expect(mentalHealth).toHaveAttribute('href', `/space/${TOPIC_HOME}/${TOPIC_A}`);
    expect(screen.getByRole('link', { name: /Russia-Ukraine war/ })).toHaveAttribute(
      'href',
      `/space/${TOPIC_HOME}/${TOPIC_B}`
    );
  });

  it('shows the placeholder image for a topic with no image', async () => {
    renderFollowing();
    await userEvent.click(screen.getByLabelText('Following: 2 follows'));

    const warRow = screen.getByRole('link', { name: /Russia-Ukraine war/ });
    const image = within(warRow).getByTestId('topic-image');
    expect(image).toHaveAttribute('data-value', PLACEHOLDER_SPACE_IMAGE);
  });

  it('keeps the list in its own scroll container so 100+ topics do not grow the page', async () => {
    mocks.topicIds = Array.from({ length: 120 }, (_, i) => i.toString(16).padStart(32, '0'));
    renderFollowing();
    await userEvent.click(screen.getByLabelText('Following: 120 follows'));

    const scroll = document.querySelector('.overflow-y-auto');
    expect(scroll).toBeInTheDocument();
    expect(scroll).toHaveClass('max-h-64', 'overflow-y-auto');
  });
});

describe('Following unfollow control', () => {
  beforeEach(() => {
    mocks.topicIds = [TOPIC_A];
    mocks.metadata.set(TOPIC_A, { name: 'Mental health', image: 'ipfs://a', homeSpaceId: TOPIC_HOME });
  });

  it('lets the owner unfollow a topic from the list', async () => {
    renderFollowing(OWNER_SPACE);
    await userEvent.click(screen.getByLabelText('Following: 1 follow'));

    await userEvent.click(screen.getByRole('button', { name: 'Unfollow Mental health' }));
    expect(mocks.unfollow).toHaveBeenCalledWith([TOPIC_A]);
  });

  it('disables the unfollow control while that topic is being written', async () => {
    mocks.pending = new Set([TOPIC_A]);
    renderFollowing(OWNER_SPACE);
    await userEvent.click(screen.getByLabelText('Following: 1 follow'));

    expect(screen.getByRole('button', { name: 'Unfollow Mental health' })).toBeDisabled();
  });

  it('shows visitors the list without any unfollow control', async () => {
    // A visitor: the space being viewed is not the viewer's personal space.
    mocks.personalSpaceId = OTHER_SPACE;
    renderFollowing(OWNER_SPACE);
    await userEvent.click(screen.getByLabelText('Following: 1 follow'));

    expect(screen.getByRole('link', { name: /Mental health/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Unfollow/ })).not.toBeInTheDocument();
  });
});

describe('Following row with people (GEO-3236)', () => {
  beforeEach(() => {
    mocks.topicIds = [TOPIC_A, ADA_SPACE];
    mocks.metadata.set(TOPIC_A, { name: 'Mental health', image: 'ipfs://a', homeSpaceId: TOPIC_HOME });
    mocks.spaces.set(ADA_SPACE, { id: ADA_SPACE, entity: { name: 'Ada Okafor', image: 'ipfs://ada' } });
  });

  it('counts people and topics together', () => {
    renderFollowing();

    expect(screen.getByLabelText('Following: 2 follows')).toBeInTheDocument();
  });

  it('lists a followed person by name, linking to their profile, beside the topics', async () => {
    mocks.personalSpaceId = OTHER_SPACE;
    renderFollowing();
    await userEvent.click(screen.getByLabelText('Following: 2 follows'));

    expect(screen.getAllByRole('link').map(link => link.textContent)).toEqual(['Ada Okafor', 'Mental health']);
    expect(screen.getByRole('link', { name: /Ada Okafor/ })).toHaveAttribute('href', `/space/${ADA_SPACE}`);
    expect(screen.getByText('Person')).toBeInTheDocument();
    expect(screen.getByText('Topic')).toBeInTheDocument();
  });

  it('lets the owner unfollow a person from the list', async () => {
    renderFollowing(OWNER_SPACE);
    await userEvent.click(screen.getByLabelText('Following: 2 follows'));
    await userEvent.click(screen.getByRole('button', { name: 'Unfollow Ada Okafor' }));

    expect(mocks.unfollow).toHaveBeenCalledWith([ADA_SPACE]);
  });
});

describe('Followers row (GEO-3236)', () => {
  const renderFollowers = () => render(<FollowersRow spaceId={OWNER_SPACE} />);

  it('is hidden while nobody follows them', () => {
    mocks.followers = { count: 0, ids: [] };
    renderFollowers();

    expect(screen.queryByText('Followers')).toBeNull();
  });

  it('pulses while the followers load', () => {
    renderFollowers();

    expect(screen.getByText('Followers')).toBeInTheDocument();
    expect(document.querySelector('.animate-pulse')).toBeInTheDocument();
  });

  it('shows their faces and lists the followers, each linking to their profile', async () => {
    mocks.followers = { count: 2, ids: [ZED_SPACE, ADA_SPACE] };
    mocks.spaces.set(ADA_SPACE, { id: ADA_SPACE, entity: { name: 'Ada Okafor', image: null } });
    mocks.spaces.set(ZED_SPACE, { id: ZED_SPACE, entity: { name: 'Zed Lee', image: null } });
    renderFollowers();
    // Two faces and nothing else: no leading count, and no badge with nobody past the stack.
    expect(screen.getByLabelText('Followers: 2 followers').textContent).toBe('');
    await userEvent.click(screen.getByLabelText('Followers: 2 followers'));

    expect(screen.getAllByRole('link').map(link => link.textContent)).toEqual(['Ada Okafor', 'Zed Lee']);
    expect(screen.getByRole('link', { name: /Zed Lee/ })).toHaveAttribute('href', `/space/${ZED_SPACE}`);
  });
});

describe('follow rows while the space lookup holds an older map', () => {
  it('waits for a new follower rather than naming them "Untitled person"', () => {
    // Followers grew by ZED; the lookup still holds the map from before, with only ADA.
    mocks.followers = { count: 2, ids: [ADA_SPACE, ZED_SPACE] };
    mocks.spaces.set(ADA_SPACE, { id: ADA_SPACE, entity: { name: 'Ada Okafor', image: null } });
    mocks.spacesPlaceholder = true;
    render(<FollowersRow spaceId={OWNER_SPACE} />);

    expect(document.querySelector('.animate-pulse')).toBeInTheDocument();
    expect(screen.queryByLabelText(/Followers:/)).toBeNull();
  });

  it('waits for a newly followed person in the Following list too', () => {
    mocks.topicIds = [ADA_SPACE, ZED_SPACE];
    // ZED is a person, per the follow, but not in the held-over map yet.
    mocks.spaces.set(ADA_SPACE, { id: ADA_SPACE, entity: { name: 'Ada Okafor', image: null } });
    mocks.spacesPlaceholder = true;
    // The follow says ZED is a person even though the map doesn't know them yet.
    mocks.personIds = [ZED_SPACE];
    renderFollowing();

    expect(document.querySelector('.animate-pulse')).toBeInTheDocument();
  });

  it('draws a list that shrank at once, every name already in hand', () => {
    // An unfollow: the held-over map still has everyone left.
    mocks.followers = { count: 1, ids: [ADA_SPACE] };
    mocks.spaces.set(ADA_SPACE, { id: ADA_SPACE, entity: { name: 'Ada Okafor', image: null } });
    mocks.spaces.set(ZED_SPACE, { id: ZED_SPACE, entity: { name: 'Zed Lee', image: null } });
    mocks.spacesPlaceholder = true;
    render(<FollowersRow spaceId={OWNER_SPACE} />);

    expect(screen.getByLabelText('Followers: 1 follower')).toBeInTheDocument();
  });
});
