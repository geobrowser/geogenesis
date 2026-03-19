'use client';

import { useEffect, useRef } from 'react';

import { usePathname, useSearchParams } from 'next/navigation';

import { Space } from '~/core/io/dto/spaces';
import { useEditable } from '~/core/state/editable-store';

import { Generate } from './generate';
import { Publish } from './publish';

type ImportProps = {
  spaceId: string;
  space: Space;
};

export const Import = ({ spaceId, space }: ImportProps) => {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { setEditable } = useEditable();
  const hasProcessedRef = useRef(false);

  useEffect(() => {
    if (hasProcessedRef.current) return;
    hasProcessedRef.current = true;

    setEditable(true);

    // Clean up ?edit param if present
    if (searchParams?.get('edit') === 'true') {
      const next = new URLSearchParams(searchParams.toString());
      next.delete('edit');
      const query = next.toString();
      const url = pathname + (query ? `?${query}` : '');
      window.history.replaceState(null, '', url);
    }
  }, [pathname, searchParams, setEditable]);

  return (
    <>
      <Generate spaceId={spaceId} space={space} />
      <Publish spaceId={spaceId} space={space} />
    </>
  );
};
