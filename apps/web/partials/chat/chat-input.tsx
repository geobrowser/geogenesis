'use client';

import * as React from 'react';

import Textarea from 'react-textarea-autosize';

type Props = {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  disabled?: boolean;
  placeholder?: string;
};

export function ChatInput({ value, onChange, onSubmit, disabled, placeholder = 'Ask anything...' }: Props) {
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);
  const canSend = !disabled && value.trim().length > 0;

  React.useEffect(() => {
    textareaRef.current?.focus();
  }, []);

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
        minRows={2}
        // No maxRows — the textarea auto-resizes with content. Height is
        // bounded by the chat panel via `max-h-[60cqh]` (60% of the panel,
        // which sets `container-type: size`). Capping by row count alone
        // caused an inner scrollbar to appear after ~4 lines even when the
        // panel had room; container-relative max keeps the bar invisible for
        // any realistic message length on any panel size.
        className="max-h-[60cqh] flex-1 resize-none bg-transparent text-[16px] leading-4 tracking-[-0.35px] text-text placeholder:text-grey-03 focus:outline-hidden"
      />
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
    </form>
  );
}
