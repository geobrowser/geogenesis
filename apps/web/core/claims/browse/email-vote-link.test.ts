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

  const key = { viewerId: 'did:privy:a', claimId: 'claim', spaceId: 'space' };

  it('remembers a claim per space', () => {
    expect(wasEmailVoteLinkHandled(key)).toBe(false);
    markEmailVoteLinkHandled(key);
    expect(wasEmailVoteLinkHandled(key)).toBe(true);
    expect(wasEmailVoteLinkHandled({ ...key, spaceId: 'other-space' })).toBe(false);
  });

  it('keeps one viewer’s answered link from blocking another’s on a shared browser', () => {
    markEmailVoteLinkHandled(key);
    expect(wasEmailVoteLinkHandled({ ...key, viewerId: 'did:privy:b' })).toBe(false);
    expect(wasEmailVoteLinkHandled({ ...key, viewerId: null })).toBe(false);
  });

  it('forgets a claim after sixty days', () => {
    markEmailVoteLinkHandled(key, Date.now() - 61 * 24 * 60 * 60 * 1000);
    expect(wasEmailVoteLinkHandled(key)).toBe(false);
  });
});
