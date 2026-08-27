import { describe, expect, it } from 'vitest';

import {
  createPostFlowAdvanceToOpeningPanel,
  createPostFlowComplete,
  createPostFlowPanelOpened,
  createPostFlowStart,
  isCreatePostNavigationReady,
  shouldClearMainEditOnSidePanelClose,
  shouldSuppressSidePanelPathnameAutoClose,
} from './create-post-flow';

const payload = {
  postEntityId: 'post-1',
  spaceId: 'space-1',
  profileEntityId: 'profile-1',
  postsTabEntityId: 'tab-posts',
  profilePathname: '/space/space-1/profile-1',
};

describe('createPostFlow', () => {
  it('suppresses pathname auto-close while navigating and opening', () => {
    expect(shouldSuppressSidePanelPathnameAutoClose({ phase: 'idle' })).toBe(false);
    expect(shouldSuppressSidePanelPathnameAutoClose(createPostFlowStart(payload))).toBe(true);
    expect(
      shouldSuppressSidePanelPathnameAutoClose(createPostFlowAdvanceToOpeningPanel(createPostFlowStart(payload)))
    ).toBe(true);
    expect(
      shouldSuppressSidePanelPathnameAutoClose(
        createPostFlowPanelOpened(createPostFlowAdvanceToOpeningPanel(createPostFlowStart(payload)))
      )
    ).toBe(false);
  });

  it('advances through pending → openingPanel → panelOpen → idle', () => {
    const pending = createPostFlowStart(payload);
    const opening = createPostFlowAdvanceToOpeningPanel(pending);
    expect(opening.phase).toBe('openingPanel');

    const panelOpen = createPostFlowPanelOpened(opening);
    expect(panelOpen.phase).toBe('panelOpen');

    expect(createPostFlowComplete(panelOpen)).toEqual({ phase: 'idle' });
  });

  it('detects when posts tab navigation is ready', () => {
    expect(isCreatePostNavigationReady('/space/space-1/profile-1', 'tab-posts', payload)).toBe(true);
    expect(isCreatePostNavigationReady('/space/space-1/profile-1/', 'tab-posts', payload)).toBe(true);
    expect(isCreatePostNavigationReady('/space/space-1/profile-1', 'other-tab', payload)).toBe(false);
    expect(isCreatePostNavigationReady('/space/space-1/other', 'tab-posts', payload)).toBe(false);
  });

  it('clears main edit only when closing the create-post panel', () => {
    const panelOpen = createPostFlowPanelOpened(createPostFlowAdvanceToOpeningPanel(createPostFlowStart(payload)));

    expect(shouldClearMainEditOnSidePanelClose(panelOpen, { entityId: 'post-1' })).toBe(true);
    expect(shouldClearMainEditOnSidePanelClose(panelOpen, { entityId: 'other' })).toBe(false);
    expect(shouldClearMainEditOnSidePanelClose({ phase: 'idle' }, { entityId: 'post-1' })).toBe(false);
  });
});
