'use client';

import { useEffect, useMemo, useState } from 'react';

export function useWindowSize() {
  const [windowSize, setWindowSize] = useState<{ width: number; height: number }>({
    width: 1920,
    height: 1080,
  });

  useEffect(() => {
    function handleResize() {
      setWindowSize({
        width: window.innerWidth,
        height: window.innerHeight,
      });
    }

    window.addEventListener('resize', handleResize);
    handleResize();

    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return useMemo(() => {
    return {
      width: windowSize.width,
      height: windowSize.height,
    };
  }, [windowSize.height, windowSize.width]);
}
