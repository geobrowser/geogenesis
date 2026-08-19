import { afterEach, describe, expect, it } from 'vitest';

import {
  clearDebateReturnPath,
  debateReturnPath,
  isDebateSurfacePath,
  rememberDebateReturnPath,
} from './debate-return-path';

afterEach(() => {
  sessionStorage.clear();
});

describe('debate return path', () => {
  it('remembers the screen the viewer was on', () => {
    rememberDebateReturnPath('/space/space-1/claims');

    expect(debateReturnPath()).toBe('/space/space-1/claims');
  });

  it('keeps the most recent screen', () => {
    rememberDebateReturnPath('/space/space-1/claims');
    rememberDebateReturnPath('/space/space-2/people');

    expect(debateReturnPath()).toBe('/space/space-2/people');
  });

  // Recording any of these would return the viewer into the flow they just left.
  it.each([
    '/space/space-1/debates/debate-1',
    '/space/space-1/debates/debate-1/recording',
    '/space/space-1/debates/rematches/session-1',
  ])('refuses to remember %s', path => {
    rememberDebateReturnPath('/space/space-1/claims');
    rememberDebateReturnPath(path);

    expect(isDebateSurfacePath(path)).toBe(true);
    expect(debateReturnPath()).toBe('/space/space-1/claims');
  });

  // The hub is an ordinary page to start from — it is only the room and the picker that are not.
  it('remembers the debates hub, which has no debate of its own', () => {
    rememberDebateReturnPath('/space/space-1/debates');

    expect(isDebateSurfacePath('/space/space-1/debates')).toBe(false);
    expect(debateReturnPath()).toBe('/space/space-1/debates');
  });

  it('reports nothing when the viewer opened the room cold', () => {
    expect(debateReturnPath()).toBeNull();
  });

  it('forgets the path once it has been used', () => {
    rememberDebateReturnPath('/space/space-1/claims');
    clearDebateReturnPath();

    expect(debateReturnPath()).toBeNull();
  });
});
