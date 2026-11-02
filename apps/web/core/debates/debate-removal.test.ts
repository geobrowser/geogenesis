import { beforeEach, describe, expect, it } from 'vitest';

import type { Debate } from './api';
import {
  canRemoveDebate,
  canRestoreDebate,
  debateVisibilityErrorMessage,
  forgetOwnRemoval,
  isRemovedDebateAnswer,
  rememberOwnRemoval,
} from './debate-removal';

const DEBATE_ID = '01a0448a-61d3-7101-8434-a20fdadf6f97';

function debate(overrides: Partial<Pick<Debate, 'status' | 'participants'>> = {}) {
  return {
    status: 'complete',
    participants: [
      { user_id: 'user-a', profile_space_id: 'aaaa0000aaaa0000aaaa0000aaaa0000' },
      { user_id: 'user-b', profile_space_id: 'bbbb0000bbbb0000bbbb0000bbbb0000' },
    ],
    ...overrides,
  } as Pick<Debate, 'status' | 'participants'>;
}

describe('canRemoveDebate', () => {
  it('lets a participant remove, by geo-chat user id or by personal space', () => {
    expect(
      canRemoveDebate({ debate: debate(), viewerUserId: 'user-a', viewerPersonalSpaceId: null, isSpaceEditor: false })
    ).toBe(true);
    expect(
      canRemoveDebate({
        debate: debate(),
        viewerUserId: null,
        viewerPersonalSpaceId: 'bbbb0000-bbbb-0000-bbbb-0000bbbb0000',
        isSpaceEditor: false,
      })
    ).toBe(true);
  });

  it('lets an editor of the space remove a debate they were not in', () => {
    expect(
      canRemoveDebate({ debate: debate(), viewerUserId: 'user-z', viewerPersonalSpaceId: null, isSpaceEditor: true })
    ).toBe(true);
  });

  it('offers nothing to anyone else, or while signed out', () => {
    expect(
      canRemoveDebate({
        debate: debate(),
        viewerUserId: 'user-z',
        viewerPersonalSpaceId: 'cccc0000cccc0000cccc0000cccc0000',
        isSpaceEditor: false,
      })
    ).toBe(false);
    expect(
      canRemoveDebate({ debate: debate(), viewerUserId: null, viewerPersonalSpaceId: null, isSpaceEditor: false })
    ).toBe(false);
  });

  it('offers nothing on a debate that is not complete, which geo-chat refuses', () => {
    expect(
      canRemoveDebate({
        debate: debate({ status: 'in_progress' }),
        viewerUserId: 'user-a',
        viewerPersonalSpaceId: null,
        isSpaceEditor: true,
      })
    ).toBe(false);
  });
});

describe('canRestoreDebate', () => {
  let storage: Storage;
  beforeEach(() => {
    window.localStorage.clear();
    storage = window.localStorage;
  });

  it('always lets an editor restore', () => {
    expect(canRestoreDebate({ debateId: DEBATE_ID, viewerUserId: null, isSpaceEditor: true, storage })).toBe(true);
  });

  it('lets the person who removed it restore, from geo-chat’s own record of who that was', () => {
    rememberOwnRemoval(DEBATE_ID, 'user-a', storage);

    // Either spelling of the id: the entity page has the hex one, geo-chat the hyphenated one.
    expect(
      canRestoreDebate({ debateId: DEBATE_ID.replace(/-/g, ''), viewerUserId: 'user-a', isSpaceEditor: false, storage })
    ).toBe(true);
    expect(canRestoreDebate({ debateId: DEBATE_ID, viewerUserId: 'user-b', isSpaceEditor: false, storage })).toBe(
      false
    );
  });

  it('forgets a removal once it is restored', () => {
    rememberOwnRemoval(DEBATE_ID, 'user-a', storage);
    forgetOwnRemoval(DEBATE_ID, storage);

    expect(canRestoreDebate({ debateId: DEBATE_ID, viewerUserId: 'user-a', isSpaceEditor: false, storage })).toBe(
      false
    );
    expect(storage.getItem('geo:debate-removals')).toBeNull();
  });

  it('records nothing for a removal geo-chat attributes to no one', () => {
    rememberOwnRemoval(DEBATE_ID, null, storage);
    expect(storage.getItem('geo:debate-removals')).toBeNull();
  });

  it('survives corrupt or missing storage', () => {
    storage.setItem('geo:debate-removals', '{not json');
    expect(canRestoreDebate({ debateId: DEBATE_ID, viewerUserId: 'user-a', isSpaceEditor: false, storage })).toBe(
      false
    );
    expect(canRestoreDebate({ debateId: DEBATE_ID, viewerUserId: 'user-a', isSpaceEditor: false, storage: null })).toBe(
      false
    );
  });
});

describe('isRemovedDebateAnswer', () => {
  it('is only geo-chat’s debate_not_found, as a 404, for an id it minted', () => {
    expect(isRemovedDebateAnswer(DEBATE_ID, 404, 'debate_not_found')).toBe(true);
    expect(isRemovedDebateAnswer(DEBATE_ID, 404, null)).toBe(false);
    expect(isRemovedDebateAnswer(DEBATE_ID, 500, 'debate_not_found')).toBe(false);
    expect(isRemovedDebateAnswer('debate-99', 404, 'debate_not_found')).toBe(false);
  });
});

describe('debateVisibilityErrorMessage', () => {
  it('explains a refused restore without implying the viewer did anything wrong', () => {
    expect(debateVisibilityErrorMessage('debate_visibility_forbidden', 'restore')).toMatch(/editor/);
    expect(debateVisibilityErrorMessage(null, 'remove')).toBe('Could not remove this debate. Try again.');
  });
});
