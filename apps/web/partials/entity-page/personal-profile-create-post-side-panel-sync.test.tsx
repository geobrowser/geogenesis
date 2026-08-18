import { render } from '@testing-library/react';

import * as React from 'react';

import { Provider, createStore } from 'jotai';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createPostFlowStart } from '~/core/state/personal-profile/create-post-flow';

import { PersonalProfileCreatePostSidePanelSync } from './personal-profile-create-post-side-panel-sync';
import { createPostFlowAtom } from '~/atoms/personal-profile-suggested';

const mocks = {
  pathname: '/space/space-1/profile-1',
  searchTabId: 'tab-posts',
  setEditable: vi.fn(),
  openSidePanel: vi.fn(),
  routerPush: vi.fn(),
  routerReplace: vi.fn(),
};

vi.mock('next/navigation', () => ({
  usePathname: () => mocks.pathname,
  useRouter: () => ({
    push: mocks.routerPush,
    replace: mocks.routerReplace,
  }),
  useSearchParams: () => ({
    get: (key: string) => (key === 'tabId' ? mocks.searchTabId : null),
  }),
}));

vi.mock('~/core/hooks/use-entity-side-panel', () => ({
  useEntitySidePanel: () => ({
    openSidePanel: mocks.openSidePanel,
    closeSidePanel: vi.fn(),
    sidePanelTarget: null,
  }),
}));

vi.mock('~/core/state/editable-store', () => ({
  useEditable: () => ({
    editable: false,
    setEditable: mocks.setEditable,
  }),
}));

const payload = {
  postEntityId: 'post-1',
  spaceId: 'space-1',
  profileEntityId: 'profile-1',
  postsTabEntityId: 'tab-posts',
  profilePathname: '/space/space-1/profile-1',
};

describe('PersonalProfileCreatePostSidePanelSync', () => {
  beforeEach(() => {
    mocks.setEditable.mockReset();
    mocks.openSidePanel.mockReset();
    mocks.routerPush.mockReset();
    mocks.routerReplace.mockReset();
    mocks.pathname = '/space/space-1/profile-1';
    mocks.searchTabId = 'tab-posts';
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      cb(0);
      return 1;
    });
  });

  it('does not enable main edit mode when opening the create-post side panel', () => {
    const store = createStore();
    store.set(createPostFlowAtom, createPostFlowStart(payload));

    render(
      <Provider store={store}>
        <PersonalProfileCreatePostSidePanelSync />
      </Provider>
    );

    expect(mocks.setEditable).not.toHaveBeenCalledWith(true);
    expect(mocks.openSidePanel).toHaveBeenCalledWith('post-1', 'space-1', true);
    expect(store.get(createPostFlowAtom).phase).toBe('panelOpen');
  });

  it('forces main edit off while the create-post panel is open', () => {
    const store = createStore();
    store.set(createPostFlowAtom, {
      phase: 'panelOpen',
      payload,
    });

    render(
      <Provider store={store}>
        <PersonalProfileCreatePostSidePanelSync />
      </Provider>
    );

    expect(mocks.setEditable).toHaveBeenCalledWith(false);
  });
});
