'use client';

import cx from 'classnames';
import { useAtomValue } from 'jotai';

import * as React from 'react';

import { editingPropertiesAtom } from '~/atoms';

interface Props {
  children: React.ReactNode;
  isShown?: boolean;
  isEditMode?: boolean;
}

export function TableCell({ children, isShown, isEditMode }: Props) {
  const isEditingColumns = useAtomValue(editingPropertiesAtom);

  return (
    <td
      className={cx(
        !isShown ? (!isEditingColumns || !isEditMode ? 'hidden' : 'bg-grey-01! text-grey-03!') : null,
        'min-h-[40px] border-b border-grey-02 bg-transparent p-[10px] align-middle'
      )}
    >
      <div className="relative h-full w-full leading-none">
        <div className="flex items-center gap-2">{children}</div>
      </div>
    </td>
  );
}
