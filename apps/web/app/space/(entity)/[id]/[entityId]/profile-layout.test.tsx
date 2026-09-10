import '@testing-library/jest-dom/vitest';
import { cleanup, render } from '@testing-library/react';

import * as React from 'react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// The layout 404s on anything `IdUtils.isValid` rejects, so these are real ids rather than labels.
/** The route params. The fetched person's id is deliberately a different one. */
const ROUTE_ENTITY_ID = 'a1b2c3d4e5f6427a8b9c0d1e2f3a4b5c';
const SPACE_ID = 'b2c3d4e5f6a7418b9c0d1e2f3a4b5c6d';
/** What `cachedFetchEntity` reports as the person's own id. */
const FETCHED_PERSON_ID = 'c3d4e5f6a7b8429c0d1e2f3a4b5c6d7e';

const mocks = vi.hoisted(() => ({
  actions: null as Record<string, unknown> | null,
  heading: null as Record<string, unknown> | null,
  storeProvider: null as Record<string, unknown> | null,
  metadataHeader: null as Record<string, unknown> | null,
}));

vi.mock('./cached-fetch-entity', async () => {
  const { SystemIds } = await import('@geoprotocol/geo-sdk/lite');
  const person = {
    id: 'c3d4e5f6a7b8429c0d1e2f3a4b5c6d7e',
    name: 'Ada Lovelace',
    types: [{ id: SystemIds.PERSON_TYPE }],
    relations: [],
    values: [],
    spaces: [],
  };

  return {
    cachedFetchEntityPage: async () => ({ entity: person }),
    cachedFetchEntity: async () => person,
    cachedFetchEntitiesBatch: async () => [],
  };
});

vi.mock('~/core/blocks/data/fetch-block-shown-properties', () => ({
  fetchShownPropertyEntitiesForBlocks: async () => [],
}));
vi.mock('~/core/blocks/data/fetch-collection-items', () => ({
  fetchCollectionItemsForBlocks: async () => ({}),
}));

vi.mock('~/core/state/entity-page-store/entity-store-provider', () => ({
  EntityStoreProvider: (props: { children: React.ReactNode; id: string; spaceId: string }) => {
    mocks.storeProvider = { id: props.id, spaceId: props.spaceId };
    return <div>{props.children}</div>;
  },
}));
vi.mock('~/core/state/editor/editor-provider', () => ({
  RouteEditorProvider: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('~/partials/entity-page/entity-page-actions', () => ({
  EntityPageActions: (props: Record<string, unknown>) => {
    mocks.actions = props;
    return <div data-testid="actions" />;
  },
}));
vi.mock('~/partials/entity-page/editable-entity-header', () => ({
  EditableHeading: (props: Record<string, unknown>) => {
    mocks.heading = props;
    return <div data-testid="title" />;
  },
}));
vi.mock('~/partials/entity-page/entity-page-metadata-header', () => ({
  EntityPageMetadataHeader: (props: Record<string, unknown>) => {
    mocks.metadataHeader = props;
    return <div data-testid="metadata" />;
  },
}));

vi.mock('~/partials/entity-page/entity-page-cover', () => ({ EntityPageCover: () => null }));
vi.mock('~/partials/entity-page/entity-page-content-container', () => ({
  EntityPageContentContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock('~/partials/entity-page/entity-page-inline-description', () => ({
  EntityPageInlineDescription: () => null,
}));
vi.mock('~/partials/entity-page/entity-tabs', () => ({ EntityTabs: () => null }));
vi.mock('~/partials/entity-page/personal-profile-suggested-card', () => ({
  PersonalProfileSuggestedCard: () => null,
}));
vi.mock('~/partials/entity-page/personal-profile-suggested-task-sync', () => ({
  PersonalProfileSuggestedTaskSync: () => null,
}));

// Statically, below the mocks vitest hoists above it. Importing this graph inside a test body ran
// it against the 5s test timeout instead, which the route's module tree exceeds under a parallel
// run — it is the layout, so it pulls in most of the entity page.
import ProfileLayout from './layout';

beforeEach(() => {
  mocks.actions = null;
  mocks.heading = null;
  mocks.storeProvider = null;
  mocks.metadataHeader = null;
});

afterEach(cleanup);

async function renderProfileLayout() {
  const element = await ProfileLayout({
    params: Promise.resolve({ id: SPACE_ID, entityId: ROUTE_ENTITY_ID }),
    children: <div data-testid="page" />,
  });

  return render(element);
}

/**
 * `getProfilePage` spreads the fetched person, so `profile.id` is that entity's own id — which is
 * the route id only when the fetch resolved to the same entity, and falls back to the route id when
 * it missed entirely. The store provider, the title and `generateMetadata` are all keyed on the
 * route id, so handing the actions the other one meant the history panel, the context menu and the
 * vote buttons could read and write a different entity than the one the page names.
 *
 * `RouteEditorProvider` (layout.tsx:91) is still keyed on `profile.id`. Left alone on purpose: it
 * is given that entity's blocks and tabs, so the fetched id is the right one there — the two are
 * equal at runtime either way.
 */
describe('profile ProfileLayout', () => {
  it('gives the actions the route entity id, not the fetched profile id', async () => {
    await renderProfileLayout();

    expect(mocks.actions).toMatchObject({ entityId: ROUTE_ENTITY_ID, spaceId: SPACE_ID, isVoteable: true });
    expect(mocks.actions?.entityId).not.toBe(FETCHED_PERSON_ID);
  });

  it('keys the title, the store and the actions on one id', async () => {
    await renderProfileLayout();

    expect(mocks.storeProvider).toMatchObject({ id: ROUTE_ENTITY_ID, spaceId: SPACE_ID });
    expect(mocks.heading).toMatchObject({ entityId: ROUTE_ENTITY_ID, spaceId: SPACE_ID });
    expect(mocks.actions?.entityId).toBe(mocks.heading?.entityId);
    // The metadata header takes its id from the store rather than a prop, so pinning the provider
    // above is what covers it — the space it scopes by is the one assertable here.
    expect(mocks.metadataHeader).toMatchObject({ spaceId: SPACE_ID });
  });
});
