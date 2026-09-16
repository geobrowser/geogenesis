import { describe, expect, it } from 'vitest';

import { shouldHideFlowBar } from './flow-bar-visibility';

const base = { opsCount: 2, editable: false, sidePanelWantsEdit: false, hasToast: false, reviewState: 'idle' };

describe('shouldHideFlowBar', () => {
  it('hides when nothing is being edited, even with pending changes', () => {
    expect(shouldHideFlowBar(base)).toBe(true);
  });

  it('shows in the main view edit mode', () => {
    expect(shouldHideFlowBar({ ...base, editable: true })).toBe(false);
  });

  it("shows for the entity side panel's own edit mode, so panel edits can be published", () => {
    expect(shouldHideFlowBar({ ...base, sidePanelWantsEdit: true })).toBe(false);
  });

  it('hides again once the panel leaves edit mode (the panel resets its flag on close)', () => {
    expect(shouldHideFlowBar({ ...base, sidePanelWantsEdit: false })).toBe(true);
  });

  it('keeps the other guards: no changes, an active toast, or a review in progress', () => {
    expect(shouldHideFlowBar({ ...base, editable: true, opsCount: 0 })).toBe(true);
    expect(shouldHideFlowBar({ ...base, editable: true, hasToast: true })).toBe(true);
    expect(shouldHideFlowBar({ ...base, sidePanelWantsEdit: true, reviewState: 'reviewing' })).toBe(true);
  });
});
