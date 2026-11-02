import { act, renderHook } from '@testing-library/react';

import { Provider, createStore } from 'jotai';
import { describe, expect, it } from 'vitest';

import { useOpenClaimInSidePanel } from './use-open-claim-in-side-panel';
import { entitySidePanelAtom } from '~/atoms';

describe('useOpenClaimInSidePanel', () => {
  // GEO-3332. The claim's own space, not the one the viewer is in: a lobby or a rematch has none.
  it('opens the claim in its own space, read-only', () => {
    const store = createStore();
    const { result } = renderHook(() => useOpenClaimInSidePanel(), {
      wrapper: ({ children }) => <Provider store={store}>{children}</Provider>,
    });

    act(() => result.current({ claim_entity_id: 'claim-1', space_id: 'space-1' }));

    expect(store.get(entitySidePanelAtom)).toMatchObject({
      entityId: 'claim-1',
      spaceId: 'space-1',
      openedWithMainViewEditing: false,
      forceRequestedSpace: true,
    });
  });
});
