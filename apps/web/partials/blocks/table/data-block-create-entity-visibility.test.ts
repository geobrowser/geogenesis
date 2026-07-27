import { describe, expect, it } from 'vitest';

import { shouldShowCreateEntityAction } from './data-block-create-entity-visibility';

const editableQuery = {
  canEdit: true,
  sourceType: 'GEO' as const,
  singleSpaceTarget: null,
  singleSpaceAccessResolved: true,
  canCreateInSingleSpace: true,
};

describe('shouldShowCreateEntityAction', () => {
  it('hides the add action in browse mode even when the user can edit', () => {
    expect(shouldShowCreateEntityAction({ ...editableQuery, isEditing: false })).toBe(false);
  });

  it('shows the add action in edit mode when the user can edit', () => {
    expect(shouldShowCreateEntityAction({ ...editableQuery, isEditing: true })).toBe(true);
  });

  it('keeps the add action hidden without edit permission or for relation sources', () => {
    expect(shouldShowCreateEntityAction({ ...editableQuery, isEditing: true, canEdit: false })).toBe(false);
    expect(shouldShowCreateEntityAction({ ...editableQuery, isEditing: true, sourceType: 'RELATIONS' })).toBe(false);
  });

  it('waits for confirmed create access when the query targets one space', () => {
    const singleSpaceQuery = { ...editableQuery, isEditing: true, singleSpaceTarget: 'space-id' };

    expect(shouldShowCreateEntityAction({ ...singleSpaceQuery, singleSpaceAccessResolved: false })).toBe(false);
    expect(shouldShowCreateEntityAction({ ...singleSpaceQuery, canCreateInSingleSpace: false })).toBe(false);
    expect(shouldShowCreateEntityAction(singleSpaceQuery)).toBe(true);
  });

  it('only treats null, not an empty target id, as the absence of a single-space target', () => {
    expect(
      shouldShowCreateEntityAction({
        ...editableQuery,
        isEditing: true,
        singleSpaceTarget: '',
        singleSpaceAccessResolved: false,
      })
    ).toBe(false);
  });
});
