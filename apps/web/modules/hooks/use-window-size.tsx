import { useEffect, useMemo, useState } from 'react';

export function useWindowSize() {
  const [windowSize, setWindowSize] = useState<{ width: number; height: number }>({
    width: 0,
    height: 0,
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
