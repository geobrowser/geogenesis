import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';

import * as React from 'react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { CLAIM_TYPE_ID } from '~/core/claims/ontology';

import { EntityPageBody } from './entity-page-body';

const mocks = vi.hoisted(() => ({
  actions: null as Record<string, unknown> | null,
  cover: null as Record<string, unknown> | null,
  entity: { id: 'entity-1', types: [] as { id: string }[] },
  heading: null as Record<string, unknown> | null,
  editing: false,
  claimPage: null as Record<string, unknown> | null,
}));

vi.mock('~/core/hooks/use-user-is-editing', () => ({ useUserIsEditing: () => mocks.editing }));
vi.mock('~/core/sync/use-store', () => ({
  useQueryEntity: () => ({ entity: mocks.entity, isLoading: false }),
}));
// `useCustomBrowseView` asks for the space to tell a person's profile from an
// ordinary entity. This file renders without a QueryClient on purpose — it is
// about the header row, not about data — so the space is stubbed like the rest.
vi.mock('~/core/hooks/use-space', () => ({ useSpace: () => ({ space: null, isLoading: false }) }));
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
vi.mock('~/partials/entity-page/entity-page-cover', () => ({
  EntityPageCover: (props: Record<string, unknown>) => {
    mocks.cover = props;
    return <div data-testid="cover" />;
  },
}));
vi.mock('~/partials/entity-page/entity-page-content-container', () => ({
  EntityPageContentContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock('~/partials/entity-page/entity-tabs', () => ({ EntityTabs: () => null }));
vi.mock('~/partials/entity-page/toggle-entity-page', () => ({
  ToggleEntityPage: () => <div data-testid="properties" />,
}));
vi.mock('~/partials/entity-page/automatic-mode-toggle', () => ({ AutomaticModeToggle: () => null }));
vi.mock('~/partials/entity-page/backlinks-client-container', () => ({ BacklinksClientContainer: () => null }));
vi.mock('~/partials/entity-page/type-schema-inline', () => ({ TypeSchemaInline: () => null }));
vi.mock('~/partials/entity-page/entity-page-header', () => ({ EntityPageHeader: () => null }));
vi.mock('~/partials/editor/editor', () => ({ Editor: () => null }));
vi.mock('~/partials/comments/comments-section', () => ({ CommentSection: () => null }));
vi.mock('~/core/claims/browse/claim-page-view', () => ({
  CLAIM_PAGE_CONTENT_MAX_WIDTH: 720,
  ClaimPageView: (props: Record<string, unknown>) => {
    mocks.claimPage = props;
    return <div data-testid="claim-page">{props.footer as React.ReactNode}</div>;
  },
}));
vi.mock('~/core/topics/browse/topic-page-view', () => ({ TopicPageView: () => null }));
vi.mock('~/partials/profile/person-profile-view', () => ({ PersonProfileView: () => null }));

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
  mocks.cover = null;
  mocks.entity = { id: 'entity-1', types: [] };
  mocks.heading = null;
  mocks.editing = false;
  mocks.claimPage = null;
});

afterEach(cleanup);

/**
 * A relation page is the side panel opened on a relation itself rather than on an entity. It hides
 * type metadata and voting, because a relation has neither to show.
 *
 * On master this worked by accident of layout: the menu and history lived in `EditableHeading`,
 * which the side panel rendered outside the gate, so a relation page kept them. Extracting
 * `EntityPageActions` moved them next to the metadata header and under its gate, and relation
 * pages lost both — a regression this PR introduced and then fixed in 640fc513d.
 *
 * The gate answers "is there type metadata to show", which is a different question from "can this
 * entity be acted on". Nothing enforced that split before; this does.
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

describe('EntityPageBody claim side panel', () => {
  it('shows both configured claim images above the custom view', () => {
    mocks.entity = { id: 'entity-1', types: [{ id: CLAIM_TYPE_ID }] };

    render(
      <EntityPageBody
        variant="sidePanel"
        {...SHARED}
        avatarUrl="https://example.com/avatar.png"
        coverUrl="https://example.com/cover.png"
      />
    );

    expect(screen.getByTestId('cover')).toBeInTheDocument();
    expect(screen.getByTestId('claim-page')).toBeInTheDocument();
    expect(mocks.cover).toMatchObject({
      avatarUrl: 'https://example.com/avatar.png',
      coverUrl: 'https://example.com/cover.png',
      fitImage: true,
      withAvatar: true,
      contentMaxWidth: 720,
    });
  });

  it('keeps the custom claim view and appends properties while editing', () => {
    mocks.entity = { id: 'entity-1', types: [{ id: CLAIM_TYPE_ID }] };
    mocks.editing = true;

    render(<EntityPageBody variant="sidePanel" {...SHARED} />);

    expect(screen.getByTestId('claim-page')).toBeInTheDocument();
    expect(screen.getByTestId('properties')).toBeInTheDocument();
    expect(mocks.claimPage?.isEditing).toBe(true);
    expect(mocks.claimPage?.footer).toBeTruthy();
  });
});
