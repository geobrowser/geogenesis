import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';

import * as React from 'react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { EntityPageBody } from './entity-page-body';

const mocks = vi.hoisted(() => ({
  actions: null as Record<string, unknown> | null,
  heading: null as Record<string, unknown> | null,
}));

vi.mock('~/core/hooks/use-user-is-editing', () => ({ useUserIsEditing: () => false }));
vi.mock('~/core/sync/use-store', () => ({
  useQueryEntity: () => ({ entity: { id: 'entity-1', types: [] }, isLoading: false }),
}));
vi.mock('~/core/utils/use-entity-media', () => ({
  useEntityMediaUrl: () => null,
  useImageUrlFromEntity: () => null,
}));

vi.mock('~/partials/entity-page/entity-page-actions', () => ({
  EntityPageActions: (props: Record<string, unknown>) => {
    mocks.actions = props;
    return <div data-testid="actions" />;
  },
}));
vi.mock('~/partials/entity-page/entity-page-metadata-header', () => ({
  EntityPageMetadataHeader: () => <div data-testid="metadata" />,
}));
vi.mock('~/partials/entity-page/editable-entity-header', () => ({
  EditableHeading: (props: Record<string, unknown>) => {
    mocks.heading = props;
    return <div data-testid="title" />;
  },
}));
vi.mock('~/partials/entity-page/entity-page-inline-description', () => ({
  EntityPageInlineDescription: () => <div data-testid="description" />,
  ENTITY_DESCRIPTION_MAX_LINES: 3,
}));

// Everything below the header row. Each reaches for the sync engine, the editor or geo-chat, and
// none of it is what this file asserts.
vi.mock('~/partials/entity-page/entity-page-cover', () => ({ EntityPageCover: () => null }));
vi.mock('~/partials/entity-page/entity-page-content-container', () => ({
  EntityPageContentContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock('~/partials/entity-page/entity-tabs', () => ({ EntityTabs: () => null }));
vi.mock('~/partials/entity-page/toggle-entity-page', () => ({ ToggleEntityPage: () => null }));
vi.mock('~/partials/entity-page/automatic-mode-toggle', () => ({ AutomaticModeToggle: () => null }));
vi.mock('~/partials/entity-page/backlinks-client-container', () => ({ BacklinksClientContainer: () => null }));
vi.mock('~/partials/entity-page/type-schema-inline', () => ({ TypeSchemaInline: () => null }));
vi.mock('~/partials/entity-page/entity-page-header', () => ({ EntityPageHeader: () => null }));
vi.mock('~/partials/editor/editor', () => ({ Editor: () => null }));
vi.mock('~/partials/comments/comments-section', () => ({ CommentSection: () => null }));
vi.mock('~/core/claims/browse/claim-page-view', () => ({ ClaimPageView: () => null }));
vi.mock('~/core/topics/browse/topic-page-view', () => ({ TopicPageView: () => null }));

const SHARED = {
  entityId: 'entity-1',
  spaceId: 'space-1',
  initialTabRelations: [],
  tabEntities: [],
  avatarUrl: null,
  coverUrl: null,
};

function renderPanel(overrides?: { isRelationPage?: boolean; previewName?: string | null }) {
  return render(<EntityPageBody variant="sidePanel" {...SHARED} {...overrides} />);
}

beforeEach(() => {
  mocks.actions = null;
  mocks.heading = null;
});

afterEach(cleanup);

/**
 * A relation page is the side panel opened on a relation itself rather than on an entity. It hides
 * type metadata and voting, because a relation has neither to show.
 *
 * The actions used to live inside the metadata header, so hiding one hid the other: opening a
 * relation lost the context menu and the history panel along with the types. They are separate
 * components now, and this pins the split — the gate answers "is there type metadata to show",
 * which is a different question from "can this entity be acted on".
 */
describe('EntityPageBody relation side panel', () => {
  it('keeps the menu and history on a relation page', () => {
    renderPanel({ isRelationPage: true });

    expect(screen.getByTestId('actions')).toBeInTheDocument();
    expect(mocks.actions).toMatchObject({ entityId: 'entity-1', spaceId: 'space-1' });
  });

  it('hides the type metadata and the vote controls on a relation page', () => {
    renderPanel({ isRelationPage: true });

    expect(screen.queryByTestId('metadata')).toBeNull();
    expect(mocks.actions).toMatchObject({ isVoteable: false });
  });

  it('drops the description on a relation page too', () => {
    renderPanel({ isRelationPage: true });

    expect(screen.queryByTestId('description')).toBeNull();
  });

  it('shows metadata and voting on an ordinary entity panel', () => {
    renderPanel({ isRelationPage: false });

    expect(screen.getByTestId('metadata')).toBeInTheDocument();
    expect(screen.getByTestId('description')).toBeInTheDocument();
    expect(mocks.actions).toMatchObject({ isVoteable: true });
  });

  // The title is outside the gate entirely — a relation page is still titled.
  it('titles a relation page from the preview name', () => {
    renderPanel({ isRelationPage: true, previewName: 'Preview name' });

    expect(screen.getByTestId('title')).toBeInTheDocument();
    expect(mocks.heading).toMatchObject({ entityId: 'entity-1', spaceId: 'space-1', fallbackName: 'Preview name' });
  });
});
