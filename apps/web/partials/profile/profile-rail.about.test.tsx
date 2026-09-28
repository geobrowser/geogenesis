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
}));

vi.mock('~/core/hooks/use-user-is-editing', () => ({ useUserIsEditing: () => mocks.isEditing }));
vi.mock('~/core/hooks/use-profile-facts', () => ({ useProfileFacts: () => ({}) }));
vi.mock('~/core/hooks/use-personal-space-id', () => ({ usePersonalSpaceId: () => ({ personalSpaceId: SPACE_ID }) }));
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
      positionsCount={0}
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
        positionsCount={0}
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
