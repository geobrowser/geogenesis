import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { SpacePageMetadataHeader } from './space-metadata-header';

const mocks = vi.hoisted(() => ({
  editable: false,
  types: [{ id: 'space-type', name: 'Space' }] as { id: string; name: string | null }[],
}));

vi.mock('~/core/hooks/use-user-is-editing', () => ({
  useUserIsEditing: () => mocks.editable,
}));

vi.mock('~/core/state/entity-page-store/entity-store', () => ({
  useEntityTypes: () => mocks.types,
}));

vi.mock('~/core/state/entity-page-store/entity-store-provider', () => ({
  useEntityStoreInstance: () => ({ id: 'entity-1' }),
}));

vi.mock('../entity-page/editable-entity-page', () => ({
  RelationsGroup: () => <div data-testid="types-editor" />,
}));

vi.mock('../entity-page/entity-vote-buttons', () => ({
  EntityVoteButtons: () => <div data-testid="vote-buttons" />,
}));

vi.mock('./add-data-panel', () => ({
  AddDataChip: () => <div data-testid="add-data" />,
}));

const members = <div data-testid="members" />;

describe('SpacePageMetadataHeader', () => {
  beforeEach(() => {
    mocks.editable = false;
    mocks.types = [
      { id: 'space-type', name: 'Space' },
      { id: 'person-type', name: 'Person' },
    ];
  });

  afterEach(cleanup);

  it('shows the type chips and the vote pair on an ordinary space', () => {
    render(<SpacePageMetadataHeader spaceId="space-1" membersComponent={members} />);

    expect(screen.getByText('Space')).toBeInTheDocument();
    expect(screen.getByText('Person')).toBeInTheDocument();
    expect(screen.getByTestId('vote-buttons')).toBeInTheDocument();
  });

  it('renders nothing at all for a reader on a profile', () => {
    // Every part of the row is rendered elsewhere on a profile or says nothing
    // about a person. Two vote pairs on one entity is the sharpest version:
    // the profile's action row carries its own.
    const { container } = render(
      <SpacePageMetadataHeader spaceId="space-1" membersComponent={members} profileChrome />
    );

    expect(container).toBeEmptyDOMElement();
  });

  it('still edits types on a profile in edit mode', () => {
    // The rail's pills are read-only, so suppressing the whole row for the
    // editor too would leave a profile with no way to add a type at all.
    mocks.editable = true;

    render(<SpacePageMetadataHeader spaceId="space-1" membersComponent={members} profileChrome />);

    expect(screen.getByTestId('types-editor')).toBeInTheDocument();
  });
});
