'use client';

import { atom, useAtom } from 'jotai';

export const editableAtom = atom(false);

export const useEditable = () => {
  const [editable, setEditable] = useAtom(editableAtom);

  return {
    editable,
    setEditable,
  };
};
