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

  if (isLoading) {
    return <div className="flex-1" />;
  }

  return (
    <div className="flex flex-1 flex-col justify-end gap-4 px-4 pb-4">
      <div className="pl-2 text-smallTitle text-text">Get started with Geo</div>
      <div className="flex flex-col items-start gap-1">
        {suggestions.map(suggestion => (
          <button
            key={suggestion}
            type="button"
            disabled={disabled}
            onClick={() => onSuggestion(suggestion)}
            className="flex items-center justify-center rounded-full border border-grey-02 px-2 pt-2 pb-2.5 text-[16px] leading-4 tracking-[-0.35px] text-text transition-colors hover:border-text disabled:cursor-not-allowed disabled:opacity-50"
          >
            {suggestion}
          </button>
        ))}
      </div>
    </div>
  );
}
