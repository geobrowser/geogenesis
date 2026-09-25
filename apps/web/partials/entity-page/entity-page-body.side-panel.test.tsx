import { SystemIds } from '@geoprotocol/geo-sdk/lite';
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';

import * as React from 'react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { CLAIM_TYPE_ID } from '~/core/claims/ontology';
import { TOPIC_TYPE_ID } from '~/core/constants';
import { DEBATE_TYPE_ID } from '~/core/debates/ontology';

import { EntityPageBody } from './entity-page-body';

const mocks = vi.hoisted(() => ({
  actions: null as Record<string, unknown> | null,
  commentSection: null as Record<string, unknown> | null,
  cover: null as Record<string, unknown> | null,
  entity: { id: 'entity-1', types: [] as { id: string }[] },
  heading: null as Record<string, unknown> | null,
  editing: false,
  isLoadingSpace: false,
  claimPage: null as Record<string, unknown> | null,
  topicPage: null as Record<string, unknown> | null,
  entityMediaUrl: null as string | null,
  previewImageUrl: null as string | null,
  space: null as { type: string; entity: { id: string; types: { id: string }[] } } | null,
}));

vi.mock('~/core/hooks/use-user-is-editing', () => ({ useUserIsEditing: () => mocks.editing }));
// Node's built-in localStorage shim can shadow jsdom with a partial object. This
// layout test only reaches the pending-space atom through transitive UI imports.
vi.mock('~/core/state/pending-personal-space', () => ({
  usePendingPersonalSpace: () => ({ isPending: false, pending: null }),
  pendingPersonalSpaceId: (topicId: string) => `pending:${topicId}`,
  isPendingPersonalSpaceId: () => false,
  PENDING_PERSONAL_SPACE_PREFIX: 'pending:',
}));
vi.mock('~/core/sync/use-store', () => ({
  useQueryEntity: () => ({ entity: mocks.entity, isLoading: false }),
}));
// `useCustomBrowseView` asks for the space to tell a person's profile from an
// ordinary entity. This file renders without a QueryClient on purpose — it is
// about the header row, not about data — so the space is stubbed like the rest.
vi.mock('~/core/hooks/use-space', () => ({
  useSpace: () => ({ space: mocks.space, isLoading: mocks.isLoadingSpace }),
}));
vi.mock('~/core/utils/use-entity-media', () => ({
  useEntityMediaUrl: () => mocks.entityMediaUrl,
  useImageUrlFromEntity: () => mocks.previewImageUrl,
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
vi.mock('~/partials/profile/person-profile-view', () => ({
  PersonProfileView: () => <div data-testid="person-profile" />,
}));
vi.mock('~/partials/profile/personal-space-profile', () => ({
  PersonalSpaceHeadline: () => <div data-testid="profile-headline" />,
}));
vi.mock('~/partials/profile/profile-tagline', () => ({
  PersonalSpaceTagline: () => <div data-testid="profile-tagline" />,
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
vi.mock('~/partials/entity-page/automatic-mode-toggle', () => ({
  AutomaticModeToggle: () => <div data-testid="automatic-mode-toggle" />,
}));
vi.mock('~/partials/entity-page/backlinks-client-container', () => ({ BacklinksClientContainer: () => null }));
vi.mock('~/partials/entity-page/type-schema-inline', () => ({ TypeSchemaInline: () => null }));
vi.mock('~/partials/entity-page/entity-page-header', () => ({ EntityPageHeader: () => null }));
vi.mock('~/partials/editor/editor', () => ({ Editor: () => null }));
vi.mock('~/partials/comments/comments-section', () => ({
  CommentSection: (props: Record<string, unknown>) => {
    mocks.commentSection = props;
    return null;
  },
}));
vi.mock('~/core/claims/browse/claim-page-view', () => ({
  CLAIM_PAGE_CONTENT_INSET_CLASS: 'claim-content-inset',
  CLAIM_PAGE_CONTENT_MAX_WIDTH: 720,
  ClaimPageView: (props: Record<string, unknown>) => {
    mocks.claimPage = props;
    return <div data-testid="claim-page">{props.footer as React.ReactNode}</div>;
  },
}));
vi.mock('~/core/topics/browse/topic-page-view', () => ({
  TOPIC_PAGE_CONTENT_INSET_CLASS: 'topic-content-inset',
  TOPIC_PAGE_CONTENT_MAX_WIDTH: 720,
  TopicPageView: (props: Record<string, unknown>) => {
    mocks.topicPage = props;
    return <div data-testid="topic-page">{props.footer as React.ReactNode}</div>;
  },
}));

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
  mocks.commentSection = null;
  mocks.cover = null;
  mocks.entity = { id: 'entity-1', types: [] };
  mocks.heading = null;
  mocks.editing = false;
  mocks.claimPage = null;
  mocks.topicPage = null;
  mocks.entityMediaUrl = null;
  mocks.previewImageUrl = null;
  mocks.isLoadingSpace = false;
  mocks.space = null;
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

  it('identifies debate comments from the generic entity footer', () => {
    mocks.entity = { id: 'entity-1', types: [{ id: DEBATE_TYPE_ID }] };

    renderPanel();

    expect(mocks.commentSection).toMatchObject({
      entityId: 'entity-1',
      spaceId: 'space-1',
      targetEntityType: 'debate',
    });
  });

  it('puts profile actions beside the name and hides Person and Space types', () => {
    const personType = { id: SystemIds.PERSON_TYPE };
    mocks.entity = { id: 'entity-1', types: [personType] };
    mocks.space = { type: 'PERSONAL', entity: { id: 'entity-1', types: [personType] } };

    renderPanel();

    expect(screen.getByTestId('person-profile')).toBeInTheDocument();
    expect(screen.queryByTestId('metadata')).toBeNull();
    expect(screen.getByTestId('title').parentElement?.parentElement).toContainElement(screen.getByTestId('actions'));
    // Name, tagline, roles — and no description at all: a person's bio is shown and edited in
    // their About tab here, the same card the space route puts in its rail.
    expect(
      screen.getByTestId('profile-tagline').compareDocumentPosition(screen.getByTestId('profile-headline')) & 4
    ).toBe(4);
    expect(screen.queryByTestId('description')).toBeNull();
    expect(screen.getByTestId('person-profile').parentElement).toHaveClass('mt-6');
    expect(mocks.actions).toMatchObject({ isVoteable: true, compact: true });
  });

  it('withholds generic-only chrome while the Person space lookup is pending', () => {
    mocks.entity = { id: 'entity-1', types: [{ id: SystemIds.PERSON_TYPE }] };
    mocks.isLoadingSpace = true;

    renderPanel();

    // The identity shared by both outcomes remains visible; metadata and
    // actions cannot be placed correctly until the space identifies a profile.
    expect(screen.getByTestId('title')).toBeInTheDocument();
    expect(screen.getByTestId('description')).toBeInTheDocument();
    expect(screen.queryByTestId('metadata')).toBeNull();
    expect(screen.queryByTestId('actions')).toBeNull();
    expect(screen.queryByTestId('profile-headline')).toBeNull();
    expect(screen.queryByTestId('person-profile')).toBeNull();
    expect(mocks.actions).toBeNull();
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
      compact: true,
      withAvatar: true,
      contentMaxWidth: 720,
      contentInsetClassName: 'claim-content-inset',
    });
  });

  it('does not render a cover or preview fallback as the claim avatar', () => {
    mocks.entity = { id: 'entity-1', types: [{ id: CLAIM_TYPE_ID }] };
    mocks.entityMediaUrl = 'https://example.com/cover-fallback.png';
    mocks.previewImageUrl = 'https://example.com/preview-fallback.png';

    render(
      <EntityPageBody
        variant="sidePanel"
        {...SHARED}
        coverUrl="https://example.com/cover.png"
        previewImageUrl="image-entity-id"
      />
    );

    expect(mocks.cover).toMatchObject({
      avatarUrl: null,
      coverUrl: 'https://example.com/cover.png',
      withAvatar: true,
    });
  });

  it('does not render a cover or preview fallback as a person avatar either', () => {
    const personType = { id: SystemIds.PERSON_TYPE };
    mocks.entity = { id: 'entity-1', types: [personType] };
    mocks.space = { type: 'PERSONAL', entity: { id: 'entity-1', types: [personType] } };
    mocks.entityMediaUrl = 'https://example.com/cover-fallback.png';
    mocks.previewImageUrl = 'https://example.com/preview-fallback.png';

    render(
      <EntityPageBody
        variant="sidePanel"
        {...SHARED}
        coverUrl="https://example.com/cover.png"
        previewImageUrl="image-entity-id"
      />
    );

    expect(mocks.cover).toMatchObject({
      avatarUrl: null,
      coverUrl: 'https://example.com/cover.png',
      withAvatar: true,
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

  it('mounts route edit initialization before the claim is already editing', () => {
    mocks.entity = { id: 'entity-1', types: [{ id: CLAIM_TYPE_ID }] };

    render(<EntityPageBody variant="route" {...SHARED} serverRelations={[]} />);

    expect(screen.getByTestId('automatic-mode-toggle')).toBeInTheDocument();
    expect(mocks.claimPage?.isEditing).toBe(false);
    expect(screen.queryByTestId('properties')).not.toBeInTheDocument();
  });

  it('mounts the same route edit initialization for the Topic custom surface', () => {
    mocks.entity = { id: 'entity-1', types: [{ id: TOPIC_TYPE_ID }] };

    render(<EntityPageBody variant="route" {...SHARED} serverRelations={[]} />);

    expect(screen.getByTestId('topic-page')).toBeInTheDocument();
    expect(screen.getByTestId('automatic-mode-toggle')).toBeInTheDocument();
  });

  it('does not mount route edit initialization in the side panel', () => {
    mocks.entity = { id: 'entity-1', types: [{ id: CLAIM_TYPE_ID }] };

    render(<EntityPageBody variant="sidePanel" {...SHARED} />);

    expect(screen.queryByTestId('automatic-mode-toggle')).not.toBeInTheDocument();
  });
});

describe('EntityPageBody topic side panel', () => {
  it('shows both configured topic images above the custom view', () => {
    mocks.entity = { id: 'entity-1', types: [{ id: TOPIC_TYPE_ID }] };

    render(
      <EntityPageBody variant="sidePanel" {...SHARED} avatarUrl="ipfs://topic-avatar" coverUrl="ipfs://topic-cover" />
    );

    expect(screen.getByTestId('cover')).toBeInTheDocument();
    expect(screen.getByTestId('topic-page')).toBeInTheDocument();
    expect(mocks.cover).toMatchObject({
      avatarUrl: 'ipfs://topic-avatar',
      coverUrl: 'ipfs://topic-cover',
      compact: true,
      withAvatar: true,
      contentMaxWidth: 720,
      contentInsetClassName: 'topic-content-inset',
    });
  });

  it('keeps topic tabs available and appends properties while editing', () => {
    mocks.entity = { id: 'entity-1', types: [{ id: TOPIC_TYPE_ID }] };
    mocks.editing = true;

    render(<EntityPageBody variant="sidePanel" {...SHARED} />);

    expect(screen.getByTestId('topic-page')).toBeInTheDocument();
    expect(screen.getByTestId('properties')).toBeInTheDocument();
    expect(mocks.topicPage?.isEditing).toBe(true);
    expect(mocks.topicPage?.footer).toBeTruthy();
  });
});
