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
  const gradientId = React.useId();

  return (
    <svg
      width="51"
      height="51"
      viewBox="0 0 51 51"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      data-muted-indicator="true"
      className="size-[51px]"
    >
      <path
        d="M0 25.5C0 11.4167 11.4167 0 25.5 0C39.5833 0 51 11.4167 51 25.5C51 39.5833 39.5833 51 25.5 51C11.4167 51 0 39.5833 0 25.5Z"
        fill={`url(#${gradientId})`}
        fillOpacity="0.5"
      />
      <rect x="22" y="18" width="7" height="12.5" rx="3.5" stroke="white" />
      <path
        d="M19.5 26L19.5 27C19.5 30.3137 22.1863 33 25.5 33C28.8137 33 31.5 30.3137 31.5 27V26"
        stroke="white"
        strokeLinecap="round"
      />
      <path d="M28.5 19.5L22.5 29" stroke="white" />
      <defs>
        <linearGradient id={gradientId} x1="25.5" y1="0" x2="25.5" y2="51" gradientUnits="userSpaceOnUse">
          <stop />
          <stop offset="1" stopOpacity="0.5" />
        </linearGradient>
      </defs>
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
