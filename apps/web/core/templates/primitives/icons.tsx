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

export function MoreHorizontalIcon({ className = 'size-4' }: IconProps) {
  return (
    <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden className={`shrink-0 ${className}`}>
      <circle cx="3.2" cy="8" r="1.25" />
      <circle cx="8" cy="8" r="1.25" />
      <circle cx="12.8" cy="8" r="1.25" />
    </svg>
  );
}

export function FlagIcon({ className = 'size-4' }: IconProps) {
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
      <path d="M3.2 14V2.8" />
      <path d="M3.2 3.2h8.6l-1.7 3 1.7 3H3.2" />
    </svg>
  );
}

export function MessagePlusIcon({ className = 'size-4' }: IconProps) {
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
      <path d="M2.5 4.2A1.7 1.7 0 0 1 4.2 2.5h7.6a1.7 1.7 0 0 1 1.7 1.7v5.6a1.7 1.7 0 0 1-1.7 1.7H6.6L3.4 13.8v-2.3H4.2a1.7 1.7 0 0 1-1.7-1.7V4.2Z" />
      <path d="M8 5v4M6 7h4" />
    </svg>
  );
}

/*
 * The debates app's vote icons (debates-react-native src/components/artwork.ts `agree`, `disagree`,
 * `agreeFilled`, `disagreeFilled`), drawn on its 20px grid. Filled marks the viewer's side.
 */
const AGREE_PATHS = [
  'M2.19653 8.58673C2.19653 8.14558 2.55415 7.78796 2.99529 7.78796H5.39158C5.83272 7.78796 6.19034 8.14558 6.19034 8.58673V15.3762C6.19034 15.8173 5.83272 16.175 5.39158 16.175H2.99529C2.55415 16.175 2.19653 15.8173 2.19653 15.3762V8.58673Z',
  'M9.91502 2.24328L9.53868 2.19653C8.38702 5.99065 6.19043 6.76019 6.19043 9.0129V14.3337C6.19043 14.9746 6.56124 15.567 7.16727 15.7863C9.22385 16.5306 11.3751 16.6898 13.5499 16.5025C14.878 16.3881 15.9187 15.3688 16.2113 14.0764L16.912 10.9818C17.262 9.4358 16.079 7.96623 14.4845 7.96623H10.7981L11.5852 5.42413C12.04 3.95508 11.4497 2.43393 9.91502 2.24328Z',
];
const DISAGREE_PATHS = [
  'M16.9737 10.5836C16.9737 11.0247 16.616 11.3824 16.1749 11.3824H13.7786C13.3375 11.3824 12.9799 11.0247 12.9799 10.5836V3.79412C12.9799 3.35298 13.3375 2.99536 13.7786 2.99536H16.1749C16.616 2.99536 16.9737 3.35298 16.9737 3.79412V10.5836Z',
  'M9.25522 16.9269L9.63155 16.9736C10.7832 13.1795 12.9798 12.41 12.9798 10.1573V4.83651C12.9798 4.19556 12.609 3.60317 12.003 3.38386C9.94639 2.63963 7.79512 2.48043 5.62034 2.66773C4.29225 2.78211 3.25151 3.80135 2.95889 5.09382L2.25825 8.18841C1.90824 9.73438 3.09125 11.2039 4.68577 11.2039H8.37213L7.58504 13.7461C7.1302 15.2151 7.72052 16.7363 9.25522 16.9269Z',
];

export function DebateVoteIcon({
  choice,
  filled = false,
  className = 'size-5',
}: IconProps & { choice: 'agree' | 'disagree'; filled?: boolean }) {
  return (
    <svg
      viewBox="0 0 20 20"
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth="1.35"
      strokeLinejoin="round"
      aria-hidden
      data-filled={filled ? 'true' : undefined}
      className={`shrink-0 ${className}`}
    >
      {(choice === 'agree' ? AGREE_PATHS : DISAGREE_PATHS).map(d => (
        <path key={d} d={d} />
      ))}
    </svg>
  );
}
