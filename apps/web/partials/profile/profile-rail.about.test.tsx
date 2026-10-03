import { SystemIds } from '@geoprotocol/geo-sdk/lite';
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AboutSection } from './profile-rail';

const SPACE_ID = '11111111111111111111111111111111';
const PERSON_ID = '22222222222222222222222222222222';

const mocks = vi.hoisted(() => ({
  isEditing: false,
  stored: undefined as undefined | { id: string; value: string; isDeleted?: boolean },
  setValue: vi.fn(),
  deleteValue: vi.fn(),
  pointsEnabled: false,
  points: { points: null as number | null, isLoading: false, isError: false },
  pointsSpaceIds: [] as string[],
}));

vi.mock('~/core/hooks/use-user-is-editing', () => ({ useUserIsEditing: () => mocks.isEditing }));
vi.mock('~/core/hooks/use-profile-facts', () => ({ useProfileFacts: () => ({}) }));
vi.mock('~/core/hooks/use-personal-space-id', () => ({ usePersonalSpaceId: () => ({ personalSpaceId: SPACE_ID }) }));
vi.mock('~/core/profile/use-profile-points', () => ({
  useProfilePointsEnabled: () => mocks.pointsEnabled,
  useProfilePoints: (spaceId: string) => {
    mocks.pointsSpaceIds.push(spaceId);
    return mocks.points;
  },
}));
vi.mock('~/core/sync/use-store', () => ({ useValue: () => mocks.stored ?? null }));
vi.mock('~/core/sync/use-mutate', () => ({
  useMutate: () => ({ storage: { values: { set: mocks.setValue, delete: mocks.deleteValue } } }),
}));

const FACTS = {
  joinedAt: null,
  verifiedBy: [],
  debates: 0,
  positions: 0,
  proposals: 0,
  spaces: [],
} as unknown as Parameters<typeof AboutSection>[0]['facts'];

function renderAbout(serverDescription: string | null = null) {
  return render(
    <AboutSection
      facts={FACTS}
      isLoading={false}
      isError={false}
      spaceId={SPACE_ID}
      personEntityId={PERSON_ID}
      systemEntityId={PERSON_ID}
      address={null}
      spaceType="PERSONAL"
      serverDescription={serverDescription}
    />
  );
}

beforeEach(() => {
  mocks.isEditing = false;
  mocks.stored = undefined;
  mocks.setValue.mockReset();
  mocks.deleteValue.mockReset();
  mocks.pointsEnabled = false;
  mocks.points = { points: null, isLoading: false, isError: false };
  mocks.pointsSpaceIds = [];
});

afterEach(cleanup);

/**
 * The bio has one home on a profile, and it is this card — so this card has to be where it is
 * typed. It used to be read here and written under the name, which put the same sentence in two
 * places depending on the edit toggle.
 */
describe('AboutSection description', () => {
  it('shows the server description until the store has an opinion', () => {
    renderAbout('Researching decentralized knowledge.');

    expect(screen.getByText('Researching decentralized knowledge.')).toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: 'Description' })).not.toBeInTheDocument();
  });

  it('drops the server description once the store says it was cleared', () => {
    mocks.stored = { id: 'v1', value: 'Researching decentralized knowledge.', isDeleted: true };
    renderAbout('Researching decentralized knowledge.');

    expect(screen.queryByText('Researching decentralized knowledge.')).not.toBeInTheDocument();
  });

  it('offers a field in edit mode and writes what is typed', async () => {
    const user = userEvent.setup();
    mocks.isEditing = true;
    renderAbout(null);

    const field = screen.getByRole('textbox', { name: 'Description' });
    await user.type(field, 'A');

    expect(mocks.setValue).toHaveBeenCalledWith(
      expect.objectContaining({
        spaceId: SPACE_ID,
        entity: expect.objectContaining({ id: PERSON_ID }),
        property: expect.objectContaining({ id: SystemIds.DESCRIPTION_PROPERTY }),
        value: 'A',
      })
    );
  });

  it('deletes the row rather than storing an empty string', async () => {
    const user = userEvent.setup();
    mocks.isEditing = true;
    mocks.stored = { id: 'v1', value: 'A' };
    renderAbout(null);

    await user.clear(screen.getByRole('textbox', { name: 'Description' }));

    expect(mocks.deleteValue).toHaveBeenCalledWith(mocks.stored);
    expect(mocks.setValue).not.toHaveBeenCalled();
  });

  it('offers no field when the space has no person entity to write onto', () => {
    mocks.isEditing = true;
    render(
      <AboutSection
        facts={FACTS}
        isLoading={false}
        isError={false}
        spaceId={SPACE_ID}
        personEntityId={null}
        systemEntityId={SPACE_ID}
        address={null}
        spaceType="PERSONAL"
        serverDescription={null}
      />
    );

    expect(screen.queryByRole('textbox', { name: 'Description' })).not.toBeInTheDocument();
  });
});

/** The curator points row (GEO-3113): behind a flag, and shown the way the counts above it are. */
describe('AboutSection points', () => {
  function pointsValue() {
    return screen.getByText('Points').nextElementSibling;
  }

  it('shows no row, and asks for nothing, when points are not enabled', () => {
    mocks.points = { points: 1240, isLoading: false, isError: false };
    renderAbout();

    expect(screen.queryByText('Points')).not.toBeInTheDocument();
    expect(mocks.pointsSpaceIds).toEqual([]);
  });

  it("shows the person's total for this space, after Proposals", () => {
    mocks.pointsEnabled = true;
    mocks.points = { points: 1240, isLoading: false, isError: false };
    renderAbout();

    expect(pointsValue()).toHaveTextContent('1,240');
    expect(mocks.pointsSpaceIds).toContain(SPACE_ID);
    const labels = Array.from(document.querySelectorAll('dt')).map(dt => dt.textContent);
    expect(labels.indexOf('Points')).toBe(labels.indexOf('Proposals') + 1);
  });

  it('shows zero rather than hiding the row', () => {
    mocks.pointsEnabled = true;
    mocks.points = { points: 0, isLoading: false, isError: false };
    renderAbout();

    expect(pointsValue()).toHaveTextContent('0');
  });

  it('is plain text, not a link', () => {
    mocks.pointsEnabled = true;
    mocks.points = { points: 1240, isLoading: false, isError: false };
    renderAbout();

    expect(screen.getByText('1,240').closest('a')).toBeNull();
  });

  it('holds its place with the loading placeholder while the total is on its way', () => {
    mocks.pointsEnabled = true;
    mocks.points = { points: null, isLoading: true, isError: false };
    renderAbout();

    expect(pointsValue()?.querySelector('.animate-pulse')).not.toBeNull();
  });

  it('shows a dash rather than 0 when the total could not be read', () => {
    mocks.pointsEnabled = true;
    mocks.points = { points: null, isLoading: false, isError: true };
    renderAbout();

    expect(pointsValue()).toHaveTextContent('—');
    expect(pointsValue()).not.toHaveTextContent('0');
  });
});
