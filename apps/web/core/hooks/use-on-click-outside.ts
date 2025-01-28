import { useEffect } from 'react';
import type { RefObject } from 'react';

export const useOnClickOutside = (handler: (event: Event) => void, node: RefObject<HTMLElement | null>) => {
  useEffect(() => {
    const listener = (event: Event) => {
      if (!node.current || node.current.contains(event.target as Node)) {
        return;
      }

      handler(event);
    };

    document.addEventListener('mousedown', listener);
    document.addEventListener('touchstart', listener);

    return () => {
      document.removeEventListener('mousedown', listener);
      document.removeEventListener('touchstart', listener);
    };
  }, [handler, node]);
};
