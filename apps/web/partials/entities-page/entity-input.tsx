'use client';

import { useRect } from '@radix-ui/react-use-rect';

import * as React from 'react';
import { useRef } from 'react';

import { useEntityTable } from '~/core/state/entity-table-store/entity-table-store';

import { Input } from '~/design-system/input';

import { TypeDialogPopover } from './type-dialog-popover';

interface Props {
  spaceId: string;
}

export function EntityInput({ spaceId }: Props) {
  const { query, setQuery } = useEntityTable();
  const inputContainerRef = useRef<HTMLDivElement>(null);
  const inputRect = useRect(inputContainerRef.current);

  const onChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setQuery(event.target.value);
  };

  return (
    <div ref={inputContainerRef} className="relative flex w-full gap-4 overflow-hidden sm:flex-col sm:gap-1">
      <TypeDialogPopover inputContainerWidth={Math.min(inputRect?.width || 0, 678)} spaceId={spaceId} />
      <div className="relative w-full sm:ml-0">
        <Input withSearchIcon placeholder="Search entities..." value={query} onChange={onChange} />
      </div>
    </div>
  );
}
