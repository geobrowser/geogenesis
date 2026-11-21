'use client';

import * as React from 'react';

type IconProps = {
  className?: string;
};

export function ArrowUpRightIcon({ className = 'size-4' }: IconProps) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={`shrink-0 ${className}`}
    >
      <path d="M5 11L11 5" />
      <path d="M6 5h5v5" />
    </svg>
  );
}

export function ChevronRightIcon({ className = 'size-4' }: IconProps) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={`shrink-0 ${className}`}
    >
      <path d="M6 3.5L10.5 8 6 12.5" />
    </svg>
  );
}

export function ArrowLeftIcon({ className = 'size-4' }: IconProps) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={`shrink-0 ${className}`}
    >
      <path d="M12.5 8h-9" />
      <path d="M7 4L3.5 8 7 12" />
    </svg>
  );
}

export function ArrowRightIcon({ className = 'size-4' }: IconProps) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={`shrink-0 ${className}`}
    >
      <path d="M3.5 8h9" />
      <path d="M9 4l3.5 4L9 12" />
    </svg>
  );
}

export function PlayIcon({ className = 'size-4' }: IconProps) {
  return (
    <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden className={`shrink-0 ${className}`}>
      <path d="M5.2 3.4a.8.8 0 0 1 1.2-.68l6.6 4.1a.8.8 0 0 1 0 1.36l-6.6 4.1A.8.8 0 0 1 5.2 11.6V3.4Z" />
    </svg>
  );
}

export function ArticleIcon({ className = 'size-4' }: IconProps) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={`shrink-0 ${className}`}
    >
      <rect x="2.5" y="2.5" width="11" height="11" rx="2" />
      <path d="M5.5 6h5M5.5 8.5h5M5.5 11h3" />
    </svg>
  );
}

export function DocumentIcon({ className = 'size-4' }: IconProps) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={`shrink-0 ${className}`}
    >
      <path d="M4 2.5h5.2L12.5 5.8V13.5H4V2.5Z" />
      <path d="M9 2.5V6h3.5" />
      <path d="M6 8.5h4M6 11h2.8" />
    </svg>
  );
}

export function DatasetIcon({ className = 'size-4' }: IconProps) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={`shrink-0 ${className}`}
    >
      <rect x="2.5" y="3" width="11" height="10" rx="1.8" />
      <path d="M2.5 6.5h11M6.5 6.5V13" />
    </svg>
  );
}

export function TweetIcon({ className = 'size-4' }: IconProps) {
  return (
    <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden className={`shrink-0 ${className}`}>
      <path d="M9.4 7.1 13.7 2h-1.1L8.9 6.3 6 2H2.4l4.5 6.5L2.4 14h1.1l4-4.7 3.1 4.7h3.6L9.4 7.1Zm-1.5 1.8-.5-.7L4 3h1.6l2.9 4.1.5.7 3.8 5.4h-1.6L7.9 8.9Z" />
    </svg>
  );
}

export function CheckCircleIcon({ className = 'size-4' }: IconProps) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={`shrink-0 ${className}`}
    >
      <circle cx="8" cy="8" r="6" />
      <path d="M5.5 8.2L7.2 9.9 10.7 6.3" />
    </svg>
  );
}

export function SearchIcon({ className = 'size-4' }: IconProps) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={`shrink-0 ${className}`}
    >
      <circle cx="7.2" cy="7.2" r="4.7" />
      <path d="M10.8 10.8L13.8 13.8" />
    </svg>
  );
}

export function CheckIcon({ className = 'size-4' }: IconProps) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={`shrink-0 ${className}`}
    >
      <path d="M3.5 8.3L6.6 11.4 12.6 4.8" />
    </svg>
  );
}

export function PlusIcon({ className = 'size-4' }: IconProps) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={`shrink-0 ${className}`}
    >
      <path d="M8 3.5v9M3.5 8h9" />
    </svg>
  );
}

export function CloseIcon({ className = 'size-4' }: IconProps) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={`shrink-0 ${className}`}
    >
      <path d="M4.2 4.2l7.6 7.6M11.8 4.2l-7.6 7.6" />
    </svg>
  );
}

export function NetworkIcon({ className = 'size-4' }: IconProps) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={`shrink-0 ${className}`}
    >
      <circle cx="8" cy="3.5" r="1.8" />
      <circle cx="3.5" cy="12" r="1.8" />
      <circle cx="12.5" cy="12" r="1.8" />
      <path d="M7 5L4.5 10.3M9 5l2.5 5.3M5.3 12h5.4" />
    </svg>
  );
}

export function ThumbUpIcon({ className = 'size-4' }: IconProps) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={`shrink-0 ${className}`}
    >
      <path d="M5 7.2V13H3.2A1.2 1.2 0 0 1 2 11.8V8.4A1.2 1.2 0 0 1 3.2 7.2H5Z" />
      <path d="M5 7.2 7.3 2.8a1.1 1.1 0 0 1 2 .5v3.2h3.1a1.3 1.3 0 0 1 1.27 1.58l-.8 3.6a1.4 1.4 0 0 1-1.37 1.12H5" />
    </svg>
  );
}

export function ThumbDownIcon({ className = 'size-4' }: IconProps) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={`shrink-0 ${className}`}
    >
      <path d="M5 8.8V3H3.2A1.2 1.2 0 0 0 2 4.2v3.4A1.2 1.2 0 0 0 3.2 8.8H5Z" />
      <path d="M5 8.8 7.3 13.2a1.1 1.1 0 0 0 2-.5V9.5h3.1a1.3 1.3 0 0 0 1.27-1.58l-.8-3.6A1.4 1.4 0 0 0 11.5 3.2H5" />
    </svg>
  );
}
