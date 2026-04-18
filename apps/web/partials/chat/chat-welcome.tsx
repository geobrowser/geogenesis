'use client';

import * as React from 'react';

import { useSmartAccount } from '~/core/hooks/use-smart-account';

const MEMBER_SUGGESTIONS = [
  'Learn about Geo',
  'Complete my profile',
  'Create my first post',
  'Organize my favorite movies',
  'Create a business page',
];

const GUEST_SUGGESTIONS = ['Learn about Geo'];

type Props = {
  onSuggestion: (text: string) => void;
  disabled?: boolean;
};

export function ChatWelcome({ onSuggestion, disabled }: Props) {
  const { smartAccount, isLoading } = useSmartAccount();
  const isLoggedIn = Boolean(smartAccount?.account.address);
  const suggestions = isLoggedIn ? MEMBER_SUGGESTIONS : GUEST_SUGGESTIONS;
  const heading = isLoggedIn ? 'What would you like to create?' : 'Welcome to Geo';

  if (isLoading) {
    return <div className="px-3 py-4" />;
  }

  return (
    <div className="flex flex-col gap-3 px-3 py-4">
      <div className="text-chatMedium text-text">{heading}</div>
      <div className="flex flex-col items-start gap-1.5">
        {suggestions.map(suggestion => (
          <button
            key={suggestion}
            type="button"
            disabled={disabled}
            onClick={() => onSuggestion(suggestion)}
            className="rounded-md bg-grey-01 px-2 py-1.5 text-chat text-text transition-colors hover:bg-grey-02 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {suggestion}
          </button>
        ))}
      </div>
    </div>
  );
}
