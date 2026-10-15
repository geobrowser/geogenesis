import { act, renderHook } from '@testing-library/react';

import { describe, expect, it } from 'vitest';

import {
  clearSaveVotesPromptLobby,
  closeSaveVotesPrompt,
  openSaveVotesPrompt,
  readSaveVotesPrompt,
  savePromptReasonAfterVote,
  useSaveVotesPromptLobbyName,
} from './save-votes-prompt';

describe('savePromptReasonAfterVote', () => {
  it('asks on the second vote in a feed', () => {
    expect(savePromptReasonAfterVote({ count: 1, surface: 'feed', shownCount: 0 })).toBeNull();
    expect(savePromptReasonAfterVote({ count: 2, surface: 'feed', shownCount: 0 })).toBe('threshold');
  });

  it('asks on the first vote where the claim stands alone', () => {
    expect(savePromptReasonAfterVote({ count: 1, surface: 'single', shownCount: 0 })).toBe('single_claim');
  });

  it('asks once more at five votes, then stops asking on its own', () => {
    expect(savePromptReasonAfterVote({ count: 3, surface: 'feed', shownCount: 1 })).toBeNull();
    expect(savePromptReasonAfterVote({ count: 5, surface: 'feed', shownCount: 1 })).toBe('repeat');
    expect(savePromptReasonAfterVote({ count: 9, surface: 'feed', shownCount: 2 })).toBeNull();
  });
});

describe('the lobby the sheet opened from', () => {
  it('is kept while open, replaced by a later open and cleared on close', () => {
    const { result } = renderHook(() => useSaveVotesPromptLobbyName());
    expect(result.current).toBeNull();

    act(() => openSaveVotesPrompt('single_claim', { lobbyName: ' Debate hour ' }));
    expect(result.current).toBe('Debate hour');

    act(() => openSaveVotesPrompt('single_claim'));
    expect(readSaveVotesPrompt()).toBe('single_claim');
    expect(result.current).toBeNull();

    act(() => openSaveVotesPrompt('single_claim', { lobbyName: 'Debate hour' }));
    act(() => closeSaveVotesPrompt());
    expect(result.current).toBeNull();
  });
});

describe('clearSaveVotesPromptLobby', () => {
  it('drops the lobby and keeps the sheet open', () => {
    const { result } = renderHook(() => useSaveVotesPromptLobbyName());
    act(() => openSaveVotesPrompt('single_claim', { lobbyName: 'Debate hour' }));
    act(() => clearSaveVotesPromptLobby());
    expect(result.current).toBeNull();
    expect(readSaveVotesPrompt()).toBe('single_claim');
    act(() => closeSaveVotesPrompt());
  });
});
