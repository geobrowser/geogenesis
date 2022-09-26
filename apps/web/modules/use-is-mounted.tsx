import { useEffect, useRef, useState } from 'react';

export function useIsMounted() {
  const isMounted = useRef(true);

  useEffect(() => {
    isMounted.current = true;
  }, []);

  return isMounted.current;
}
