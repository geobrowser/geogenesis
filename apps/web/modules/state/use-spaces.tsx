import { useSelector } from '@legendapp/state/react';
import { useSpaceStore } from '../services';

export const useSpaces = () => {
  const { spaces$, get, admins$, editors$ } = useSpaceStore();
  const spaces = useSelector(spaces$);
  const admins = useSelector(admins$);
  const editors = useSelector(editors$);

  return {
    spaces,
    admins,
    editors,
    getSpace: get,
  };
};
