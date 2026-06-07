'use client';

import { ChatInput } from '~/partials/chat/chat-input';

type Props = {
  spaceName: string;
  value: string;
  canPost: boolean;
  isPosting?: boolean;
  error?: string | null;
  disabledPlaceholder?: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
};

export function SpaceChatComposer({
  spaceName,
  value,
  canPost,
  isPosting = false,
  error,
  disabledPlaceholder = 'Only space members and editors can chat',
  onChange,
  onSubmit,
}: Props) {
  return (
    <div className="shrink-0 bg-white">
      <ChatInput
        value={value}
        onChange={onChange}
        onSubmit={onSubmit}
        isBusy={isPosting}
        disabled={!canPost}
        placeholder={canPost ? `Message ${spaceName}` : disabledPlaceholder}
      />
      {error ? <div className="border-t border-grey-02 px-3 py-2 text-errorMessage text-red-01">{error}</div> : null}
    </div>
  );
}
