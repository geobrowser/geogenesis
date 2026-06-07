'use client';

import * as React from 'react';

import Textarea from 'react-textarea-autosize';

type Props = {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  isBusy?: boolean;
  onStop?: () => void;
  placeholder?: string;
  disabled?: boolean;
};

export function ChatInput({
  value,
  onChange,
  onSubmit,
  isBusy,
  onStop,
  placeholder = 'Ask anything...',
  disabled = false,
}: Props) {
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);
  const canSend = !disabled && !isBusy && value.trim().length > 0;
  const showStop = isBusy && Boolean(onStop);

  React.useEffect(() => {
    if (!disabled) textareaRef.current?.focus();
  }, [disabled]);

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      if (event.nativeEvent.isComposing) return;
      event.preventDefault();
      event.stopPropagation();
      if (canSend) onSubmit();
    }
  };

  return (
    <form
      onSubmit={event => {
        event.preventDefault();
        if (canSend) onSubmit();
      }}
      className="flex items-end gap-2 border-t border-grey-02 p-3"
    >
      <Textarea
        ref={textareaRef}
        value={value}
        onChange={event => onChange(event.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        disabled={disabled}
        minRows={2}
        // Height capped by the panel (which sets container-type: size) so
        // we never get an inner scrollbar at any panel size.
        className="max-h-[60cqh] flex-1 resize-none bg-transparent text-[16px] leading-4 tracking-[-0.35px] text-text placeholder:text-grey-03 focus:outline-hidden disabled:cursor-not-allowed disabled:text-grey-03"
      />
      {showStop ? (
        <button
          type="button"
          onClick={onStop}
          aria-label="Stop generating"
          className="shrink-0 text-text transition-colors hover:text-grey-04"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect x="3" y="3" width="10" height="10" rx="1" fill="currentColor" />
          </svg>
        </button>
      ) : (
        <button
          type="submit"
          disabled={!canSend}
          aria-label="Send message"
          className="shrink-0 text-grey-03 transition-colors enabled:text-ctaPrimary enabled:hover:text-ctaHover disabled:cursor-not-allowed"
        >
          <svg width="16" height="16" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path
              d="M11.0842 6.88092L1.46761 11.8673C0.512802 12.3624 -0.443515 11.2074 0.220968 10.3617L3.16796 6.61099C3.45287 6.24837 3.45287 5.73796 3.16796 5.37534L0.22097 1.62463C-0.443513 0.778924 0.512799 -0.376031 1.4676 0.119052L11.0842 5.10541C11.8037 5.47852 11.8037 6.5078 11.0842 6.88092Z"
              fill="currentColor"
            />
          </svg>
        </button>
      )}
    </form>
  );
}
