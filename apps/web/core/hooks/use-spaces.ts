'use client';

import { useSelector } from '@legendapp/state/react';

import { useSpaceStoreInstance } from '../state/spaces-store';

export const useSpaces = () => {
  const { spaces$, admins$, editors$, editorControllers$ } = useSpaceStoreInstance();
  const spaces = useSelector(spaces$);
  const admins = useSelector(admins$);
  const editorControllers = useSelector(editorControllers$);
  const editors = useSelector(editors$);

  return {
    spaces,
    admins,
    editors,
    editorControllers,
  };
};
