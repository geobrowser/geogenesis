import { useSelector } from '@legendapp/state/react';

import { useSpaceStore } from './space-store';

export const useSpaces = () => {
  const { spaces$, admins$, editors$, editorControllers$ } = useSpaceStore();
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
