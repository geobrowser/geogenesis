'use client';

import { useRect } from '@radix-ui/react-use-rect';
import * as React from 'react';
import { useRef } from 'react';

import { Input } from '~/design-system/input';
import { TypeDialogPopover } from '../entity-page/type-dialog-popover';
import { useEntityTable } from '~/core/hooks/use-entity-table';

interface Props {
  spaceId: string;
}

export function EntityInput({ spaceId }: Props) {
  const entityTableStore = useEntityTable();
  const inputContainerRef = useRef<HTMLDivElement>(null);
  const inputRect = useRect(inputContainerRef.current);

  const onChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    entityTableStore.setQuery(event.target.value);
  };

  return (
    <div ref={inputContainerRef} className="relative flex w-full gap-4 overflow-hidden sm:flex-col sm:gap-1">
      <TypeDialogPopover inputContainerWidth={Math.min(inputRect?.width || 0, 678)} spaceId={spaceId} />
      <div className="relative w-full sm:ml-0">
        <Input withSearchIcon placeholder="Search entities..." value={entityTableStore.query} onChange={onChange} />
      </div>
    </div>
  );
}
