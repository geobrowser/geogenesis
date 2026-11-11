import { afterEach, describe, expect, it } from 'vitest';

import { closeSignInBox, isSignInBoxOpen, openSignInBox, readSignInBox } from './sign-in-box-store';

const request = (attemptId: string) => ({ attemptId, attribution: { component: 'navbar' } });

afterEach(() => closeSignInBox());

describe('sign-in box store', () => {
  it('holds the latest request', () => {
    openSignInBox(request('a'));
    openSignInBox(request('b'));
    expect(readSignInBox()?.attemptId).toBe('b');
  });

  it("closes only the attempt it is asked to, so a replaced request's close is ignored", () => {
    openSignInBox(request('a'));
    openSignInBox(request('b'));
    closeSignInBox('a');
    expect(isSignInBoxOpen()).toBe(true);
    closeSignInBox('b');
    expect(isSignInBoxOpen()).toBe(false);
  });
});
