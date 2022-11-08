'use client';

import { useSelector } from '@legendapp/state/react';
import { useSpaceStore } from '../services';

export const useSpaces = () => {
  const { spaces$, admins$, editors$ } = useSpaceStore();
  const spaces = useSelector(spaces$);
  const admins = useSelector(admins$);
  const editors = useSelector(editors$);

  return {
    spaces,
    admins,
    editors,
  };
};
