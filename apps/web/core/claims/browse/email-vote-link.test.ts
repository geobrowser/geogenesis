import { beforeEach, describe, expect, it } from 'vitest';

import { markEmailVoteLinkHandled, readEmailVoteLink, wasEmailVoteLinkHandled } from './email-vote-link';

const params = (search: string) => new URLSearchParams(search);

describe('readEmailVoteLink', () => {
  it('reads the side and the email it came from', () => {
    expect(readEmailVoteLink(params('side=agree&ref_email=welcome'))).toEqual({ position: true, refEmail: 'welcome' });
    expect(readEmailVoteLink(params('side=Disagree'))).toEqual({ position: false, refEmail: null });
  });

  it('asks for nothing without a side it knows', () => {
    expect(readEmailVoteLink(params('ref_email=welcome'))).toBeNull();
    expect(readEmailVoteLink(params('side=maybe'))).toBeNull();
    expect(readEmailVoteLink(null)).toBeNull();
  });
});

describe('handled links', () => {
  beforeEach(() => window.localStorage.clear());

  it('remembers a claim per space', () => {
    expect(wasEmailVoteLinkHandled('claim', 'space')).toBe(false);
    markEmailVoteLinkHandled('claim', 'space');
    expect(wasEmailVoteLinkHandled('claim', 'space')).toBe(true);
    expect(wasEmailVoteLinkHandled('claim', 'other-space')).toBe(false);
  });

  it('forgets a claim after sixty days', () => {
    markEmailVoteLinkHandled('claim', 'space', Date.now() - 61 * 24 * 60 * 60 * 1000);
    expect(wasEmailVoteLinkHandled('claim', 'space')).toBe(false);
  });
});
