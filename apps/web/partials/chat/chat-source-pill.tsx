'use client';

import * as React from 'react';

type Props = {
  url: string;
  hostname: string;
  title: string | null;
};

export function ChatSourceLink({ url, hostname, title }: Props) {
  const accessible = title ?? hostname;
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      title={accessible}
      aria-label={accessible}
      className="text-footnote text-ctaPrimary hover:underline focus-visible:underline"
    >
      {hostname}
    </a>
  );
}
