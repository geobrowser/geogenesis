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
      event.preventDefault();
      if (canSend) onSubmit();
    }
  };

  return (
    <form
      onSubmit={event => {
        event.preventDefault();
        if (canSend) onSubmit();
      }}
      className="flex items-center gap-2 border-t border-grey-02 px-3 py-2"
    >
      <Textarea
        ref={textareaRef}
        value={value}
        onChange={event => onChange(event.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        minRows={1}
        maxRows={4}
        className="flex-1 resize-none bg-transparent text-chat text-text placeholder:text-grey-03 focus:outline-hidden"
      />
      <button
        type="submit"
        disabled={!canSend}
        aria-label="Send message"
        className="shrink-0 text-grey-03 transition-colors enabled:text-ctaPrimary enabled:hover:text-ctaHover disabled:cursor-not-allowed"
      >
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path
            d="M11.0842 6.88092L1.46761 11.8673C0.512802 12.3624 -0.443515 11.2074 0.220968 10.3617L3.16796 6.61099C3.45287 6.24837 3.45287 5.73796 3.16796 5.37534L0.22097 1.62463C-0.443513 0.778924 0.512799 -0.376031 1.4676 0.119052L11.0842 5.10541C11.8037 5.47852 11.8037 6.5078 11.0842 6.88092Z"
            fill="currentColor"
          />
        </svg>
      </button>
    </form>
  );
}
