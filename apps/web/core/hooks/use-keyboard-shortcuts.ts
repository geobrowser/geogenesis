import { useCallback, useEffect, useMemo } from 'react';

interface Shortcut {
  key: KeyboardEvent['key'];
  callback: () => void;
}

export function useKeyboardShortcuts(shortcuts: Shortcut[]) {
  const shortcutMap = useMemo(
    () => new Map(shortcuts.map((shortcut: Shortcut) => [shortcut.key, shortcut.callback])),
    [shortcuts]
  );

  const down = useCallback(
    (e: KeyboardEvent) => {
      // MacOS
      if (e.metaKey && shortcutMap.has(e.key)) {
        shortcutMap.get(e.key)?.();
      }

      // Windows
      if (e.ctrlKey && shortcutMap.has(e.key)) {
        shortcutMap.get(e.key)?.();
      }
    },
    [shortcutMap]
  );

  useEffect(() => {
    document.addEventListener('keydown', down);
    return () => document.removeEventListener('keydown', down);
  }, [down]);
}
