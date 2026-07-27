'use client';

import * as React from 'react';

import cx from 'classnames';

export function RecordingCircleButton({
  ariaLabel,
  title,
  onClick,
  disabled,
  active = false,
  className,
  children,
}: {
  ariaLabel: string;
  title: string;
  onClick: () => void;
  disabled?: boolean;
  active?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      title={title}
      onClick={onClick}
      disabled={disabled}
      className={cx(
        'grid size-10 place-items-center rounded-full border border-grey-02 bg-white text-text shadow-light transition disabled:opacity-50',
        active && 'bg-bg',
        className
      )}
    >
      {children}
    </button>
  );
}

export function LeaveIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="size-4" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M9 7V5a2 2 0 0 1 2-2h7v18h-7a2 2 0 0 1-2-2v-2" />
      <path d="M13 12H3" />
      <path d="M6 9l-3 3 3 3" />
    </svg>
  );
}

export function CloseIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="size-4" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M6 6l12 12M18 6 6 18" />
    </svg>
  );
}

export function MicrophoneIcon({ muted }: { muted: boolean }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="size-4" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 14a4 4 0 0 0 4-4V6a4 4 0 1 0-8 0v4a4 4 0 0 0 4 4Z" />
      <path d="M5 10a7 7 0 0 0 14 0" />
      <path d="M12 17v4" />
      <path d="M9 21h6" />
      {muted && <path d="M4 4l16 16" />}
    </svg>
  );
}

export function MutedMicrophoneIndicator() {
  return (
    <svg
      width="45"
      height="45"
      viewBox="0 0 45 45"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      data-muted-indicator="true"
      className="size-[45px]"
    >
      <rect width="45" height="44.9989" rx="22.4994" fill="white" />
      <rect x="17.6431" y="12.2852" width="9.71429" height="17.75" rx="4.85714" stroke="#151515" />
      <path
        d="M14.4644 24.1055V25.1769C14.4644 29.6149 18.0621 33.2126 22.5001 33.2126C26.9381 33.2126 30.5358 29.6149 30.5358 25.1769V24.1055"
        stroke="#151515"
        strokeLinecap="round"
      />
      <path d="M27.3216 16.6094L17.6787 25.7165" stroke="#151515" />
    </svg>
  );
}

export function CameraIcon({ disabled }: { disabled: boolean }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="size-4" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M4 7h10a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2Z" />
      <path d="M16 10l5-3v10l-5-3" />
      {disabled && <path d="M3 3l18 18" />}
    </svg>
  );
}

export function SpeakerIcon({ disabled }: { disabled: boolean }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="size-4" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M4 9v6h4l5 4V5L8 9H4Z" />
      <path d="M16 9.5a4 4 0 0 1 0 5" />
      <path d="M19 7a8 8 0 0 1 0 10" />
      {disabled && <path d="M3 3l18 18" />}
    </svg>
  );
}
