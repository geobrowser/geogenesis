import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { TAGLINE_MAX_LENGTH, TAGLINE_PROPERTY } from '~/core/profile/profile-ontology';

import { PersonalSpaceTagline } from './profile-tagline';

const SPACE_ID = '11111111111111111111111111111111';
const PERSON_ID = '22222222222222222222222222222222';

const mocks = vi.hoisted(() => ({
  isEditing: false,
  stored: undefined as undefined | { id: string; value: string; isDeleted?: boolean },
  setValue: vi.fn(),
  deleteValue: vi.fn(),
}));

vi.mock('~/core/hooks/use-user-is-editing', () => ({ useUserIsEditing: () => mocks.isEditing }));
vi.mock('~/core/sync/use-store', () => ({ useValue: () => mocks.stored ?? null }));
vi.mock('~/core/sync/use-mutate', () => ({
  useMutate: () => ({ storage: { values: { set: mocks.setValue, delete: mocks.deleteValue } } }),
}));

beforeEach(() => {
  mocks.isEditing = false;
  mocks.stored = undefined;
  mocks.setValue.mockReset();
  mocks.deleteValue.mockReset();
});

afterEach(cleanup);

describe('PersonalSpaceTagline', () => {
  it('renders the server tagline until the store has an opinion', () => {
    render(<PersonalSpaceTagline spaceId={SPACE_ID} personEntityId={PERSON_ID} fallbackTagline="Engineer at Geo" />);

    expect(screen.getByText('Engineer at Geo')).toBeInTheDocument();
  });

  it('renders nothing when there is no tagline', () => {
    const { container } = render(<PersonalSpaceTagline spaceId={SPACE_ID} personEntityId={PERSON_ID} />);

    expect(container).toBeEmptyDOMElement();
  });

  it('prefers the stored tagline over the server one', () => {
    mocks.stored = { id: 'v1', value: 'Building debates' };
    render(<PersonalSpaceTagline spaceId={SPACE_ID} personEntityId={PERSON_ID} fallbackTagline="Engineer at Geo" />);

    expect(screen.getByText('Building debates')).toBeInTheDocument();
    expect(screen.queryByText('Engineer at Geo')).not.toBeInTheDocument();
  });

  // A tombstone is the store saying the tagline is gone. Falling back to the server's copy here
  // would put it straight back on screen the moment it was cleared.
  it('drops the server tagline once the store says it was cleared', () => {
    mocks.stored = { id: 'v1', value: 'Engineer at Geo', isDeleted: true };
    const { container } = render(
      <PersonalSpaceTagline spaceId={SPACE_ID} personEntityId={PERSON_ID} fallbackTagline="Engineer at Geo" />
    );

    expect(container).toBeEmptyDOMElement();
  });

  it('writes what is typed against the Tagline property', async () => {
    const user = userEvent.setup();
    mocks.isEditing = true;
    render(<PersonalSpaceTagline spaceId={SPACE_ID} personEntityId={PERSON_ID} />);

    await user.type(screen.getByRole('textbox', { name: 'Tagline' }), 'E');

    expect(mocks.setValue).toHaveBeenCalledWith(
      expect.objectContaining({
        spaceId: SPACE_ID,
        entity: expect.objectContaining({ id: PERSON_ID }),
        property: expect.objectContaining({ id: TAGLINE_PROPERTY, name: 'Tagline' }),
        value: 'E',
      })
    );
  });

  it('caps the field at the tagline limit and counts against it', () => {
    mocks.isEditing = true;
    mocks.stored = { id: 'v1', value: 'x'.repeat(10) };
    render(<PersonalSpaceTagline spaceId={SPACE_ID} personEntityId={PERSON_ID} />);

    expect(screen.getByRole('textbox', { name: 'Tagline' })).toHaveAttribute('maxlength', String(TAGLINE_MAX_LENGTH));
    expect(screen.getByText(`10/${TAGLINE_MAX_LENGTH}`)).toBeInTheDocument();
  });

  it('deletes the row rather than storing an empty tagline', async () => {
    const user = userEvent.setup();
    mocks.isEditing = true;
    mocks.stored = { id: 'v1', value: 'Engineer at Geo' };
    render(<PersonalSpaceTagline spaceId={SPACE_ID} personEntityId={PERSON_ID} />);

    await user.clear(screen.getByRole('textbox', { name: 'Tagline' }));

    expect(mocks.deleteValue).toHaveBeenCalledWith(mocks.stored);
    expect(mocks.setValue).not.toHaveBeenCalled();
  });
});
