import { useSelector } from '@legendapp/state/react';
import { useSpaceStore } from '../services';

export const useSpaces = () => {
  const { spaces$ } = useSpaceStore();
  const spaces = useSelector(spaces$);

  return {
    spaces,
  };
};
