export type CreatePostFlowPayload = {
  postEntityId: string;
  spaceId: string;
  profileEntityId: string;
  postsTabEntityId: string;
  profilePathname: string;
};

export type CreatePostFlowState =
  | { phase: 'idle' }
  | { phase: 'pending'; payload: CreatePostFlowPayload }
  | { phase: 'openingPanel'; payload: CreatePostFlowPayload }
  | { phase: 'panelOpen'; payload: CreatePostFlowPayload };

export function createPostFlowPanelOpened(state: CreatePostFlowState): CreatePostFlowState {
  if (state.phase !== 'openingPanel') return state;
  return { phase: 'panelOpen', payload: state.payload };
}

export function createPostFlowStart(payload: CreatePostFlowPayload): CreatePostFlowState {
  return { phase: 'pending', payload };
}

export function createPostFlowPostsTabUrl(payload: CreatePostFlowPayload): string {
  return `${payload.profilePathname}?tabId=${payload.postsTabEntityId}`;
}

export function isOnCreatePostProfileSurface(pathname: string, payload: CreatePostFlowPayload): boolean {
  return pathname === payload.profilePathname || pathname === `${payload.profilePathname}/`;
}

export function isCreatePostTabActive(searchTabId: string | null | undefined, payload: CreatePostFlowPayload): boolean {
  return searchTabId === payload.postsTabEntityId;
}

export function isCreatePostNavigationReady(
  pathname: string,
  searchTabId: string | null | undefined,
  payload: CreatePostFlowPayload
): boolean {
  return isOnCreatePostProfileSurface(pathname, payload) && isCreatePostTabActive(searchTabId, payload);
}

export function createPostFlowAdvanceToOpeningPanel(state: CreatePostFlowState): CreatePostFlowState {
  if (state.phase !== 'pending') return state;
  return { phase: 'openingPanel', payload: state.payload };
}

export function createPostFlowComplete(state: CreatePostFlowState): CreatePostFlowState {
  if (state.phase === 'idle') return state;
  return { phase: 'idle' };
}

export function shouldSuppressSidePanelPathnameAutoClose(state: CreatePostFlowState): boolean {
  return state.phase === 'pending' || state.phase === 'openingPanel';
}

export function shouldClearMainEditOnSidePanelClose(
  state: CreatePostFlowState,
  sidePanelTarget: { entityId: string } | null
): boolean {
  if (!sidePanelTarget || state.phase !== 'panelOpen') return false;
  return sidePanelTarget.entityId === state.payload.postEntityId;
}
